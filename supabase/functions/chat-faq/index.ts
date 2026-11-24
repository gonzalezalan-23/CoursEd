// supabase/functions/chat-faq/index.ts
// Chatbot RAG para CoursEd — Groq + PostgreSQL full-text search

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

function json(data: unknown, status = 200, corsHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const SYSTEM_PROMPT = `Sos CoursBot, el asistente virtual de CoursEd, una plataforma de marketplace de cursos online. Respondés en español de forma amigable, concisa y profesional.

REGLAS PRINCIPALES:
1. Si te dan información de cursos encontrados, USALA para responder. Es información real de la plataforma.
2. Si no encontrás cursos relevantes, decí que no encontraste cursos específicos y sugerí navegar al catálogo o contactar soporte.
3. Respuestas cortas (máx 3-4 párrafos). Tono amigable.
4. Personalidad: cálida, directa y servicial. Nunca inicies con "Lo siento" ni digas "no puedo responder". Si te saludan, contestá el saludo con buena onda y preguntá en qué ayudar (cursos, planes, pagos, inscripciones). Si te hacen una pregunta fuera del tema, contestala brevemente si es trivial y redirigí a CoursEd.

EJEMPLOS DE RESPUESTAS:
- "hola" → "¡Hola! Soy CoursBot 😄 Puedo ayudarte con cursos, planes, pagos e inscripciones en CoursEd. ¿Qué te interesa?"
- "cuánto es 2+2" → "¡Es 4! 😄 Ya que estás, ¿te ayudo con algo de CoursEd? Tenemos cursos, planes y formas de pago."
- "¿qué cursos hay?" → Usá la información de cursos encontrados para responder con nombres reales.

FAQ:
- Planes: Básico (Gratis), Pro ($19/mes, 20% descuento), VIP ($39/mes, hasta 50% descuento, mentoría). Info en "/pricing".
- Comprar cursos: Catálogo en "Cursos". Gratis → "Inscribirse gratis". Pago → "Comprar ahora" → Mercado Pago.
- Ser instructor: Necesitás Pro o VIP. Botón "Crear curso" en navbar.
- Pagos: Mercado Pago. Moneda ARS.
- Certificado: Automático al completar todas las lecciones.
- Reembolso: 10 días, máx 30% completado. Contactar soporte.
- Contacto: "/contact" o soporte@coursed.com.`

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

async function getMembership(supabaseUrl: string, serviceKey: string, userId: string): Promise<string> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=membership:memberships(name)`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  )
  if (!res.ok) return 'Básico'
  const rows = await res.json()
  return rows?.[0]?.membership?.name ?? 'Básico'
}

async function searchCourses(
  supabaseUrl: string, serviceKey: string,
  queryText: string, matchCount = 5
): Promise<any[]> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/rpc/search_courses`,
    {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query_text: queryText, match_count: matchCount }),
    }
  )
  if (!res.ok) {
    console.error('[chat-faq] search error:', await res.text())
    return []
  }
  const data = await res.json()
  console.log('[chat-faq] search results:', JSON.stringify(data))
  return data
}

Deno.serve(async (req: Request): Promise<Response> => {
  const CORS = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  try {
    // 1. Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401, CORS)

    const token = authHeader.replace('Bearer ', '')
    const payload = decodeJwtPayload(token)
    if (!payload?.sub) return json({ error: 'Token inválido' }, 401, CORS)

    const userId = payload.sub as string

    // 2. Membership check
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('MY_SUPABASE_SERVICE_ROLE_KEY')!
    const membershipName = await getMembership(supabaseUrl, serviceKey, userId)

    if (!['Pro', 'VIP'].includes(membershipName)) {
      return json({ error: 'Membresía requerida (Pro o VIP)' }, 403, CORS)
    }

    // 3. Parse body
    let body: any = {}
    try { body = await req.json() } catch { return json({ error: 'JSON inválido' }, 400, CORS) }

    const { messages } = body
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'Mensajes requeridos' }, 400, CORS)
    }

    const recentMessages = messages.slice(-20).map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || '').slice(0, 2000),
    }))

    // 4. Extract keywords using AI (fast, cheap call)
    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) return json({ error: 'GROQ_API_KEY no configurado' }, 500, CORS)

    const lastUserMsg = recentMessages.filter(m => m.role === 'user').pop()?.content || ''

    let searchTerms = ''
    if (lastUserMsg && groqKey) {
      try {
        const kwRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
          body: JSON.stringify({
            model: 'openai/gpt-oss-20b',
            max_tokens: 150,
            temperature: 0,
            reasoning_effort: 'low',
            messages: [
              { role: 'system', content: 'Extraé palabras clave de búsqueda de la pregunta. Incluí sinónimos y palabras muy relacionadas. Solo las palabras importantes, separadas por espacios. Nada más. Ejemplo: "cursos de emprendimiento" → "cursos emprendimiento emprendedor negocio empresa". Máximo 6 palabras.' },
              { role: 'user', content: lastUserMsg },
            ],
          }),
          signal: AbortSignal.timeout(10000),
        })
        if (kwRes.ok) {
          const kwData = await kwRes.json()
          searchTerms = kwData.choices?.[0]?.message?.content?.trim() || ''
          console.log('[chat-faq] extracted keywords:', searchTerms)
        }
      } catch (err) {
        console.error('[chat-faq] keyword extraction error:', err)
      }
    }

    // 5. RAG: full-text search with extracted keywords
    let contextBlock = ''
    if (searchTerms) {
      try {
        const results = await searchCourses(supabaseUrl, serviceKey, searchTerms, 5)

        if (results.length > 0) {
          contextBlock = '\n\n--- CURSOS ENCONTRADOS EN LA PLATAFORMA ---\n'
          for (const r of results) {
            contextBlock += `\nCurso: "${r.course_title}" | Lección: "${r.lesson_title}" | Tipo: ${r.lesson_type}\n`
            if (r.snippet && r.snippet.length > 10) {
              contextBlock += `Detalle: ${r.snippet}\n`
            }
          }
          contextBlock += '\nUsá esta información para responder al usuario. Si el usuario pregunta por cursos, mencionalos por nombre.'
        } else {
          console.log('[chat-faq] no search results for:', searchTerms)
        }
      } catch (err) {
        console.error('[chat-faq] Search error:', err)
      }
    }

    // 6. Groq API (main response)
    const systemPrompt = SYSTEM_PROMPT + contextBlock

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        max_tokens: 1000,
        temperature: 0.3,
        reasoning_effort: 'low',
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentMessages,
        ],
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!groqRes.ok) {
      const err = await groqRes.text()
      console.error('[chat-faq] Groq error:', groqRes.status, err)
      const detail = `Groq ${groqRes.status}: ${err.slice(0, 300).replace(/gsk_[A-Za-z0-9]+/g, '[redact]')}`
      return json({ error: 'Error al conectar con el servicio de IA', detail }, 502, CORS)
    }

    const data = await groqRes.json()
    const reply = data.choices?.[0]?.message?.content ?? 'No pude generar una respuesta.'

    console.log('[chat-faq] reply length:', reply.length)
    return json({ reply }, 200, CORS)
  } catch (err: any) {
    console.error('[chat-faq] UNHANDLED:', err?.message, err?.stack)
    return json({ error: 'Error interno del servidor' }, 500, {})
  }
})
