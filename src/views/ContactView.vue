<template>
  <div class="min-h-screen bg-surface text-slate-100 py-12">
    <div class="mx-auto max-w-2xl px-6">
      <h1 class="text-3xl font-extrabold sm:text-4xl">Contacto</h1>
      <p class="mt-3 text-slate-400">
        ¿Tenés una consulta, sugerencia o problema? Escribinos y te responderemos a la brevedad.
      </p>

      <!-- Info cards -->
      <div class="mt-8 grid gap-4 sm:grid-cols-2">
        <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20">
              <svg class="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            </div>
            <div>
              <p class="text-sm font-semibold text-white">Email</p>
              <p class="text-sm text-slate-400">soporte@coursed.com</p>
            </div>
          </div>
        </div>
        <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20">
              <svg class="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div>
              <p class="text-sm font-semibold text-white">Horario</p>
              <p class="text-sm text-slate-400">Lun - Vie, 9:00 - 18:00</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Form -->
      <form @submit.prevent="submit" class="mt-8 space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-300">Nombre</label>
            <input v-model="form.name" type="text" required placeholder="Tu nombre"
              class="w-full rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30" />
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-300">Email</label>
            <input v-model="form.email" type="email" required placeholder="tu@email.com"
              class="w-full rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30" />
          </div>
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium text-slate-300">Asunto</label>
          <select v-model="form.subject"
            class="w-full rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-indigo-500/50">
            <option value="general">Consulta general</option>
            <option value="soporte">Soporte técnico</option>
            <option value="billing">Facturación y pagos</option>
            <option value="instructor">Instructores</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium text-slate-300">Mensaje</label>
          <textarea v-model="form.message" rows="5" required placeholder="Contanos en qué podemos ayudarte..."
            class="w-full resize-none rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30" />
        </div>

        <div v-if="error" class="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{{ error }}</div>

        <button type="submit" :disabled="sending"
          class="rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:opacity-90 disabled:opacity-60">
          {{ sending ? 'Enviando...' : 'Enviar mensaje' }}
        </button>
      </form>

      <!-- Success -->
      <div v-if="sent" class="mt-6 rounded-xl border border-green-500/30 bg-green-500/10 px-5 py-4 text-center">
        <p class="font-semibold text-green-300">Mensaje enviado correctamente</p>
        <p class="mt-1 text-sm text-green-400/80">Te responderemos a la brevedad a tu email.</p>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { supabase } from '@/services/supabase'

const form = ref({ name: '', email: '', subject: 'general', message: '' })
const sending = ref(false)
const sent = ref(false)
const error = ref(null)
let sentTimer = null

onUnmounted(() => { if (sentTimer) clearTimeout(sentTimer) })

async function submit() {
  error.value = null

  const { name, email, subject, message } = form.value

  if (!name || !email || !message) {
    error.value = 'Completá todos los campos obligatorios.'
    return
  }
  if (typeof name !== 'string' || name.length > 100) {
    error.value = 'El nombre debe tener menos de 100 caracteres.'
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    error.value = 'Email inválido.'
    return
  }
  if (typeof message !== 'string' || message.length < 10 || message.length > 2000) {
    error.value = 'El mensaje debe tener entre 10 y 2000 caracteres.'
    return
  }

  sending.value = true
  try {
    const { error: fnError } = await supabase.functions.invoke('send-contact-message', {
      body: form.value,
    })
    if (fnError) throw fnError
    sent.value = true
    form.value = { name: '', email: '', subject: 'general', message: '' }
    sentTimer = setTimeout(() => sent.value = false, 5000)
  } catch (err) {
    error.value = err.message || 'Error al enviar el mensaje. Intentalo de nuevo.'
  } finally {
    sending.value = false
  }
}
</script>
