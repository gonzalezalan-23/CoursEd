// supabase/functions/mp-webhook/index.ts
// Maneja:
//   - Checkout Pro → topic 'payment'                  → crea enrollment
//   - Orders API   → topic 'order'                    → crea enrollment (cuando esté habilitado)
//   - Checkout Pro → flow 'membership'                         → activa membresía
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MP_BASE = 'https://api.mercadopago.com'
const mpAuth  = (accessToken: string) => ({ 'Authorization': `Bearer ${accessToken}` })

// BUG-003: Verificar firma HMAC de Mercado Pago
// MP envía x-signature: "ts=...;v1=..." — HMAC-SHA256 del body raw con el webhook secret
async function verifyMpcWebhookSignature(body: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader || !secret) return false
  const parts = Object.fromEntries(signatureHeader.split(';').map(p => p.trim().split('=')))
  const ts = parts['ts']
  const v1 = parts['v1']
  if (!ts || !v1) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts + body))
  const computed = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')
  const computedBytes = new TextEncoder().encode(computed)
  const expectedBytes = new TextEncoder().encode(v1)
  if (computedBytes.length !== expectedBytes.length) return false
  return crypto.subtle.timingSafeEqual(computedBytes, expectedBytes)
}

serve(async (req) => {
  try {
    const url   = new URL(req.url)
    let rawBody = ''
    let body: any = {}

    if (req.method === 'POST') {
      rawBody = await req.text()
      try { body = JSON.parse(rawBody) } catch { /* noop */ }
    }

    const webhookSecret = Deno.env.get('MP_WEBHOOK_SECRET')?.trim()
    if (!webhookSecret) {
      console.error('CRITICAL: MP_WEBHOOK_SECRET no está configurado. Rechazando request por seguridad.')
      return new Response('Server misconfigured', { status: 500 })
    }
    if (req.method === 'POST') {
      const sig = req.headers.get('x-signature')
      const valid = await verifyMpcWebhookSignature(rawBody, sig, webhookSecret)
      if (!valid) {
        console.warn('mp-webhook: firma HMAC inválida')
        return new Response('Unauthorized', { status: 401 })
      }
    }

    const topic = url.searchParams.get('topic')
      ?? url.searchParams.get('type')
      ?? body.type
      ?? body.topic

    let bodyId: string | null = null
    bodyId = body?.data?.id ?? body?.id ?? null
    const dataId = url.searchParams.get('id') ?? url.searchParams.get('data.id') ?? bodyId
    const instructorId = url.searchParams.get('instructor_id')
    const flow = url.searchParams.get('flow')
    const mpUserId = body?.user_id ? String(body.user_id) : null
    const platformToken = Deno.env.get('MP_ACCESS_TOKEN')?.trim()

    console.log('MP webhook recibido:', JSON.stringify({ method: req.method, topic, flow, dataId, instructorId, mpUserId }))

    if (!dataId) {
      console.warn('MP webhook sin identificador de recurso')
      return new Response('ok', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('MY_SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let resourceToken = platformToken
    if (flow !== 'membership' && (instructorId || mpUserId) && (topic === 'payment' || topic === 'order' || topic === 'merchant_order')) {
      let instructorQuery = supabase
        .from('profiles')
        .select('mp_access_token')
      instructorQuery = instructorId
        ? instructorQuery.eq('id', instructorId)
        : instructorQuery.eq('mp_user_id', mpUserId)
      const { data: instructor, error: instructorError } = await instructorQuery.maybeSingle()

      if (instructorError) {
        console.error('Error buscando token del instructor:', instructorError)
        return new Response('DB error', { status: 500 })
      }

      resourceToken = instructor?.mp_access_token || platformToken
      if (!instructor?.mp_access_token) {
        console.warn('Instructor sin token OAuth; se usará el token de plataforma')
      }
    }

    if (!resourceToken) {
      console.error('MP_ACCESS_TOKEN no configurado')
      return new Response('MP token missing', { status: 500 })
    }

    if (flow !== 'membership' && (topic === 'merchant_order' || topic === 'payment') && !instructorId && !mpUserId) {
      console.error('Notificación sin instructor_id ni user_id de Mercado Pago')
      return new Response('seller identifier missing', { status: 400 })
    }

    // ══════════════════════════════════════════════════════════
    // FLUJO D: MEMBRESÍA → preapproval autorizado
    // ══════════════════════════════════════════════════════════
    if (topic === 'subscription_preapproval') {
      const mpRes = await fetch(`${MP_BASE}/preapproval/${dataId}`, { headers: mpAuth(resourceToken) })
      if (!mpRes.ok) {
        console.error('MP preapproval lookup error:', mpRes.status, await mpRes.text())
        return new Response('MP error', { status: 502 })
      }

      const preapproval = await mpRes.json()
      // Solo activar cuando el usuario autorizó la suscripción
      if (preapproval.status !== 'authorized') return new Response('ok', { status: 200 })

      let ref: any = {}
      try { ref = JSON.parse(preapproval.external_reference ?? '{}') } catch { /* noop */ }

      if (ref.type !== 'membership_subscription' || !ref.buyer_id || !ref.membership_id) {
        return new Response('Referencia inválida', { status: 400 })
      }

      // Activar membresía por 1 mes
      const expiresAt = new Date()
      expiresAt.setMonth(expiresAt.getMonth() + 1)

      const { error } = await supabase
        .from('profiles')
        .update({
          membership_id:         ref.membership_id,
          membership_expires_at: expiresAt.toISOString(),
        })
        .eq('id', ref.buyer_id)

      if (error) { console.error('Error activando membresía:', error); return new Response('DB error', { status: 500 }) }
      console.log('Membresía activada:', ref.buyer_id, ref.membership_id)
      return new Response('ok', { status: 200 })
    }

    // ══════════════════════════════════════════════════════════
    // FLUJO C: CURSO → payment de Checkout Pro
    // ══════════════════════════════════════════════════════════
    // MP puede notificar 'payment', 'order' o 'merchant_order'.
    // El merchant_order puede llegar con status 'opened' primero,
    // luego el pago se aprueba y llega 'payment' o se actualiza el merchant_order.
    // ══════════════════════════════════════════════════════════
    if (topic === 'payment' || topic === 'order' || topic === 'merchant_order') {
      const endpoint = topic === 'merchant_order'
        ? `${MP_BASE}/merchant_orders/${dataId}`
        : topic === 'order'
          ? `${MP_BASE}/v1/orders/${dataId}`
          : `${MP_BASE}/v1/payments/${dataId}`

      const mpRes = await fetch(endpoint, { headers: mpAuth(resourceToken) })
      if (!mpRes.ok) {
        console.error('MP payment lookup error:', mpRes.status, await mpRes.text())
        return new Response('MP error', { status: 502 })
      }

      const data = await mpRes.json()
      const paymentStatuses = Array.isArray(data.payments)
        ? data.payments.map((item: any) => ({ id: item.id, status: item.status }))
        : undefined

      console.log('MP recurso consultado:', JSON.stringify({
        id: data.id,
        topic,
        status: data.status,
        paymentStatuses,
        hasPayments: Array.isArray(data.payments) && data.payments.length > 0,
      }))

      // ── Determinar si el pago está aprobado ──
      let isPaid = false
      let paymentRef = null

      if (topic === 'merchant_order') {
        // merchant_order puede estar aprobado directamente
        if (data.status === 'approved' || data.status === 'paid') {
          isPaid = true
          paymentRef = data
        }
        // También buscar pagos aprobados dentro del merchant_order
        if (Array.isArray(data.payments)) {
          const approvedPayment = data.payments.find(
            (item: any) => item.status === 'approved' || item.status === 'paid'
          )
          if (approvedPayment) {
            isPaid = true
            paymentRef = approvedPayment
          }
        }
      } else {
        // notification 'payment' o 'order' → el recurso es el pago directamente
        isPaid = data.status === 'approved' || data.status === 'paid'
        paymentRef = data
      }

      // Si no está aprobado, esperar la notification de pago
      if (!isPaid) {
        if (topic === 'merchant_order') {
          console.log('merchant_order pendiente (status:', data.status, '), esperando notification de pago...')
        } else {
          console.log('Notification no aprobada (status:', data.status, '), topic:', topic)
        }
        return new Response('ok', { status: 200 })
      }

      let ref: any = {}
      try {
        const externalRefSource = paymentRef?.external_reference ?? data.external_reference
        ref = JSON.parse(externalRefSource ?? '{}')
      } catch { /* noop */ }

      console.log('Pago aprobado, external_reference:', JSON.stringify(ref))

      if (flow === 'membership' || ref.type === 'membership_purchase' || ref.t === 'mp') {
        // Referencia de membresía: claves largas (legacy) o cortas
        const memBuyerId = ref.buyer_id ?? ref.b
        const memId = ref.membership_id ?? ref.m

        if (!memBuyerId || !memId) {
          console.error('Referencia de membresía inválida:', JSON.stringify(ref))
          return new Response('Referencia inválida', { status: 400 })
        }

        // Activar membresía por 1 mes
        const expiresAt = new Date()
        expiresAt.setMonth(expiresAt.getMonth() + 1)

        const { error: membershipError } = await supabase
          .from('profiles')
          .update({
            membership_id: memId,
            membership_expires_at: expiresAt.toISOString(),
          })
          .eq('id', memBuyerId)

        if (membershipError) {
          console.error('Error activando membresía:', membershipError)
          return new Response('DB error', { status: 500 })
        }

        console.log('Membresía activada por pago único:', memBuyerId, memId)
        return new Response('ok', { status: 200 })
      }

      // Referencia de curso: claves cortas (límite 256 chars) o claves largas (legacy)
      const courseId  = ref.c ?? ref.course_id
      const buyerId   = ref.b ?? ref.buyer_id
      const instrId   = ref.i ?? ref.instructor_id
      const finalPr   = ref.p ?? ref.final_price
      const platFee   = ref.f ?? ref.platform_fee

      if (!courseId || !buyerId) {
        console.error('Referencia de curso inválida:', JSON.stringify(ref))
        return new Response('Referencia inválida', { status: 400 })
      }

      // Validate course and buyer exist in DB
      const [courseCheck, buyerCheck] = await Promise.all([
        supabase.from('courses').select('id, status').eq('id', courseId).maybeSingle(),
        supabase.from('profiles').select('id').eq('id', buyerId).maybeSingle(),
      ])
      if (!courseCheck.data || courseCheck.data.status !== 'published') {
        console.error('Curso inválido o no publicado:', courseId)
        return new Response('Invalid course', { status: 400 })
      }
      if (!buyerCheck.data) {
        console.error('Comprador no encontrado:', buyerId)
        return new Response('Invalid buyer', { status: 400 })
      }

      const { error } = await supabase.from('enrollments').upsert({
        user_id:        buyerId,
        course_id:      courseId,
        amount_paid:    finalPr ?? paymentRef?.transaction_amount ?? data.total_amount ?? 0,
        commission_fee: platFee ?? 0,
        status:         'active',
      }, { onConflict: 'user_id,course_id' })

      if (error) {
        console.error('Error creando enrollment:', error)
        return new Response('DB error', { status: 500 })
      }
      console.log('✅ Enrollment creado:', buyerId, courseId)
      return new Response('ok', { status: 200 })
    }

    console.log('MP webhook ignorado:', topic)
    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response('Internal error', { status: 500 })
  }
})
