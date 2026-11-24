// supabase/functions/create-payment/index.ts
// Flujo C: Compra de curso  → Checkout Pro + marketplace_fee
// Flujo D: Membresía mensual → Subscriptions API (POST /preapproval)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decode } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

function getCorsHeaders(req: Request): Record<string, string> {
  const allowedOrigins = [
    Deno.env.get('APP_URL')?.trim().replace(/\/$/, ''),
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean)
  const origin = req.headers.get('origin') || ''
  const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || 'http://localhost:5173'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

const MP_BASE = 'https://api.mercadopago.com'

function mpHeaders() {
  const accessToken = Deno.env.get('MP_ACCESS_TOKEN')?.trim()
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken ?? ''}`,
  }
}

serve(async (req: Request) => {
  const CORS_HEADERS = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401, CORS_HEADERS)

    // BUG-002/009: verify_jwt=true en config.toml ya validó la firma y expiración del JWT.
    // Este decode manual extrae el subject (user id) del payload ya verificado.
    let userId: string
    try {
      const token = authHeader.replace('Bearer ', '')
      const [, payload] = decode(token)
      userId = (payload as any).sub
      if (!userId) throw new Error('sin sub')
    } catch {
      return json({ error: 'Token inválido' }, 401, CORS_HEADERS)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('MY_SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let body: any = {}
    try { body = await req.json() } catch { return json({ error: 'JSON inválido' }, 400, CORS_HEADERS) }

    const { courseId, plan } = body
    if (!courseId && !plan) return json({ error: 'courseId o plan requerido' }, 400, CORS_HEADERS)

    const platformToken = Deno.env.get('MP_ACCESS_TOKEN')?.trim()
    if (!platformToken) return json({ error: 'MP_ACCESS_TOKEN no configurado en Supabase' }, 500, CORS_HEADERS)

    const user = { id: userId }

    const appUrl = Deno.env.get('APP_URL')?.trim().replace(/\/$/, '') || 'http://localhost:5173'
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
    const webhookUrl = `${supabaseUrl}/functions/v1/mp-webhook`

    // ══════════════════════════════════════════════════════════
    // FLUJO D: MEMBRESÍA → Checkout Pro por un pago único
    // ══════════════════════════════════════════════════════════
    if (plan) {
      const { data: membership, error: memErr } = await supabase
        .from('memberships')
        .select('id, name, price')
        .eq('name', plan)
        .maybeSingle()

      if (memErr || !membership) return json({ error: `Plan '${plan}' no encontrado` }, 400, CORS_HEADERS)

      const membershipPayload = {
        items: [{
          id: membership.id,
          title: `Membresía ${membership.name}`,
          quantity: 1,
          unit_price: parseFloat(membership.price),
          currency_id: 'ARS',
        }],
        external_reference: JSON.stringify({
          t: 'mp',
          b: user.id,
          m: membership.id,
          n: membership.name,
        }),
        notification_url: `${webhookUrl}?flow=membership`,
        back_urls: {
          success: `${appUrl}/payment/success?type=membership`,
          failure: `${appUrl}/payment/failure?type=membership`,
          pending: `${appUrl}/payment/pending?type=membership`,
        },
        auto_return: 'approved',
      }

      const mpRes = await fetch(`${MP_BASE}/checkout/preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${platformToken}`,
        },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify(membershipPayload),
      })

      if (!mpRes.ok) {
        const err = await mpRes.text()
        console.error('MP membership preference error:', mpRes.status, err)
        return json({ error: 'Error al procesar el pago' }, 400, CORS_HEADERS)
      }

      const preference = await mpRes.json()
      const checkoutUrl = platformToken.startsWith('TEST-')
        ? (preference.sandbox_init_point || preference.init_point)
        : preference.init_point
      console.log('MP membership preference creada:', preference.id, 'notification_url:', membershipPayload.notification_url)
      return json({ init_point: preference.init_point, sandbox_url: preference.sandbox_init_point, checkout_url: checkoutUrl }, 200, CORS_HEADERS)
    }

    // ══════════════════════════════════════════════════════════
    // FLUJO C: COMPRA DE CURSO → Checkout Pro sin marketplace_fee
    // La comisión a la plataforma se gestiona internamente
    // (futuro: agregar marketplace_fee cuando el Marketplace esté activo)
    // ══════════════════════════════════════════════════════════
    const [courseRes, buyerRes] = await Promise.all([
      supabase
        .from('courses')
        .select(`id, title, slug, price, currency, instructor_id,
          instructor:profiles!instructor_id(id, full_name, mp_access_token,
            membership:memberships(name, commission_percentage))`)
        .eq('id', courseId)
        .eq('status', 'published')
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('membership:memberships(name, discount_percentage, commission_percentage)')
        .eq('id', user.id)
        .maybeSingle(),
    ])

    if (courseRes.error || !courseRes.data) return json({ error: 'Curso no encontrado' }, 400, CORS_HEADERS)

    const course = courseRes.data
    const buyerMembership = buyerRes.data?.membership
    const buyerPlan = buyerMembership?.name ?? 'Básico'

    const discountRate = parseFloat(buyerMembership?.discount_percentage ?? 0) / 100
    const basePrice    = parseFloat(course.price ?? 0)
    const finalPrice   = parseFloat((basePrice * (1 - discountRate)).toFixed(2))

    // Comisión según membresía del INSTRUCTOR
    const instructorPlan = course.instructor?.membership?.name ?? 'Básico'
    const platformFeeRate = instructorPlan === 'VIP' ? 0 : 0.20  // Pro o Básico: 20%, VIP: 0%

    const platformFee      = parseFloat((finalPrice * platformFeeRate).toFixed(2))
    const instructorAmount = parseFloat((finalPrice - platformFee).toFixed(2))

    // external_reference tiene límite de 256 caracteres en MP
    const externalRef = JSON.stringify({
      t: 'cp',
      c: course.id,
      b: user.id,
      i: course.instructor_id,
      p: finalPrice,
      f: platformFee,
      a: instructorAmount,
      m: buyerPlan,
    })
    if (externalRef.length > 256) {
      console.error('external_reference exceeds 256 chars:', externalRef.length)
      return json({ error: 'Error interno: referencia demasiado larga' }, 500, CORS_HEADERS)
    }

    // Usar siempre el token de la plataforma (consistente con membresías)
    // El token del instructor se usa solo para OAuth/datos, no para crear preferencias
    const mpAuthHeader = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${platformToken}`,
    }

    const mpPayload: any = {
      items: [{
        id:          course.id,
        title:       course.title,
        quantity:    1,
        unit_price:  finalPrice,
        currency_id: course.currency ?? 'ARS',
      }],
      external_reference: externalRef,
      notification_url:   `${webhookUrl}?instructor_id=${encodeURIComponent(course.instructor_id)}`,
      back_urls: {
        success: `${appUrl}/payment/success?course_slug=${encodeURIComponent(course.slug)}`,
        failure: `${appUrl}/payment/failure?course_slug=${encodeURIComponent(course.slug)}`,
        pending: `${appUrl}/payment/pending?course_slug=${encodeURIComponent(course.slug)}`,
      },
      auto_return: 'approved',
    }

    // Solo incluir marketplace_fee si es mayor a 0
    // NOTA: comentar para desactivarlo mientras se resuelve la configuración del Marketplace
    // if (platformFee > 0) mpPayload.marketplace_fee = platformFee

    console.log('MP preference payload:', JSON.stringify({
      instructorId: course.instructor_id,
      notificationUrl: mpPayload.notification_url,
      amount: finalPrice,
      currency: course.currency ?? 'ARS',
    }))

    const mpRes = await fetch(`${MP_BASE}/checkout/preferences`, {
      method: 'POST',
      headers: mpAuthHeader,
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify(mpPayload),
    })

    if (!mpRes.ok) {
      const err = await mpRes.text()
      console.error('MP Checkout Pro error:', mpRes.status, err)
      return json({ error: 'Error al crear la preferencia de pago' }, 400, CORS_HEADERS)
    }

    const preference = await mpRes.json()
    const isTestEnvironment = platformToken.startsWith('TEST-')
    const checkoutUrl = isTestEnvironment
      ? (preference.sandbox_init_point || preference.init_point)
      : preference.init_point

    console.log('MP preference creada:', preference.id, 'environment:', isTestEnvironment ? 'test' : 'production', 'notification_url:', mpPayload.notification_url)
    return json({
      init_point:   preference.init_point,
      sandbox_url:  preference.sandbox_init_point,
      checkout_url: checkoutUrl,
      notification_url: mpPayload.notification_url,
    }, 200, CORS_HEADERS)

  } catch (err: any) {
    console.error('create-payment error:', err)
    return json({ error: 'Error interno del servidor' }, 500, {})
  }
})

function json(data: unknown, status = 200, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
