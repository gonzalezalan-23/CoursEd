import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decode } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL')?.trim() || 'http://localhost:5173',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    let userId: string
    try {
      const token = authHeader.replace('Bearer ', '')
      const [, payload] = decode(token)
      userId = (payload as any).sub
      if (!userId) throw new Error('sin sub')
    } catch {
      return json({ error: 'Token inválido' }, 401)
    }

    let body: any = {}
    try { body = await req.json() } catch { return json({ error: 'JSON inválido' }, 400) }
    const { code } = body
    if (!code) return json({ error: 'code requerido' }, 400)

    const appUrl = Deno.env.get('APP_URL')?.trim().replace(/\/$/, '') || 'http://localhost:5173'
    const redirectUri = `${appUrl}/mp/callback`
    console.log('redirect_uri enviado a MP:', redirectUri)

    const mpRes = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        client_id:     Deno.env.get('MP_CLIENT_ID'),
        client_secret: Deno.env.get('MP_CLIENT_SECRET'),
        code,
        grant_type:   'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    if (!mpRes.ok) {
      const err = await mpRes.text()
      console.error('MP OAuth error:', err)
      return json({ error: 'Error al obtener token de MP' }, 400)
    }

    const mpData = await mpRes.json()
    const instructorToken = mpData.access_token
    if (!instructorToken) return json({ error: 'MP no devolvió access_token' }, 400)
    if (!mpData.user_id) return json({ error: 'MP no devolvió user_id' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('MY_SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { error: dbErr } = await supabase
      .from('profiles')
      .update({ mp_access_token: instructorToken, mp_user_id: String(mpData.user_id) })
      .eq('id', userId)

    if (dbErr) return json({ error: 'Error al guardar token' }, 500)

    console.log('MP OAuth OK para usuario:', userId)
    return json({ ok: true }, 200)

  } catch (err: any) {
    console.error('mp-oauth-callback unhandled:', err)
    return json({ error: 'Error interno del servidor' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
}
