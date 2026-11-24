// supabase/functions/send-contact-message/index.ts
// Recibe mensajes del formulario de contacto, los guarda en la DB y envía un email via Resend
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

serve(async (req: Request) => {
  const CORS_HEADERS = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })

  function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }

  try {
    let body: any = {}
    try { body = await req.json() } catch { return json({ error: 'JSON inválido' }, 400) }

    if (!body || typeof body !== 'object') {
      return json({ error: 'Cuerpo inválido' }, 400)
    }

    const { name, email, subject, message } = body

    // ── Validación server-side ──
    if (!name || !email || !message) {
      return json({ error: 'Faltan campos obligatorios (name, email, message)' }, 400)
    }
    if (typeof name !== 'string' || name.length > 100) {
      return json({ error: 'Nombre inválido' }, 400)
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Email inválido' }, 400)
    }
    if (typeof message !== 'string' || message.length < 10 || message.length > 2000) {
      return json({ error: 'El mensaje debe tener entre 10 y 2000 caracteres' }, 400)
    }

    const allowedSubjects = ['general', 'soporte', 'billing', 'instructor', 'otro']
    const finalSubject = allowedSubjects.includes(subject) ? subject : 'general'

    // ── Guardar en la DB ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('MY_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase env vars')
      return json({ error: 'Configuración del servidor incompleta' }, 500)
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    try {
      const { error: dbError } = await supabase.from('contact_messages').insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        subject: finalSubject,
        message: message.trim(),
      })

      if (dbError) {
        console.error('DB error guardando mensaje de contacto:', dbError)
        return json({ error: 'Error al guardar el mensaje' }, 500)
      }
    } catch (dbErr) {
      console.error('DB exception:', dbErr)
      return json({ error: 'Error de conexión con la base de datos' }, 500)
    }

    // ── Enviar email via Resend ──
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const contactEmail = Deno.env.get('CONTACT_EMAIL') || 'soporte@coursed.com'

    if (resendApiKey) {
      try {
        const subjectLabels: Record<string, string> = {
          general: 'Consulta general',
          soporte: 'Soporte técnico',
          billing: 'Facturación y pagos',
          instructor: 'Instructores',
          otro: 'Otro',
        }

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'CoursEd <noreply@coursed.com>',
            to: [contactEmail],
            reply_to: email,
            subject: `[CoursEd Contacto] ${subjectLabels[finalSubject] || finalSubject} — ${name}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1e293b;">Nuevo mensaje de contacto</h2>
                <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                  <tr>
                    <td style="padding: 8px 12px; font-weight: bold; color: #64748b; border-bottom: 1px solid #e2e8f0;">Nombre</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(name)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 12px; font-weight: bold; color: #64748b; border-bottom: 1px solid #e2e8f0;">Email</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 12px; font-weight: bold; color: #64748b; border-bottom: 1px solid #e2e8f0;">Asunto</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${subjectLabels[finalSubject] || finalSubject}</td>
                  </tr>
                </table>
                <div style="margin-top: 16px; padding: 16px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #6366f1;">
                  <p style="margin: 0; color: #334155; white-space: pre-wrap;">${escapeHtml(message)}</p>
                </div>
                <p style="margin-top: 16px; font-size: 12px; color: #94a3b8;">
                  Mensaje enviado desde el formulario de contacto de CoursEd
                </p>
              </div>
            `,
          }),
        })

        if (!emailRes.ok) {
          console.error('Resend error:', emailRes.status, await emailRes.text())
        }
      } catch (emailErr) {
        console.error('Email error:', emailErr)
        // No fail — message saved to DB
      }
    } else {
      console.warn('RESEND_API_KEY no configurado — email no enviado, pero el mensaje se guardó en la DB')
    }

    return json({ success: true, message: 'Mensaje enviado correctamente' }, 200)
  } catch (err: any) {
    console.error('Error en send-contact-message:', err)
    return json({ error: 'Error interno del servidor' }, 500)
  }
})
