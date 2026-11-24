<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/services/supabase'

const router = useRouter()
const auth = useAuthStore()

const isOpen = ref(false)
const inputText = ref('')
const messages = ref([])
const isTyping = ref(false)
const error = ref(null)
const messagesContainer = ref(null)

// Load persisted messages from Supabase
async function loadChatHistory() {
  if (!auth.user) return
  try {
    const { data, error } = await supabase
      .from('chat_history')
      .select('role, content')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) {
      console.warn('[ChatBot] Error loading chat history:', error.message)
      return
    }
    if (data && data.length > 0) {
      messages.value = data
    }
  } catch (err) {
    console.warn('[ChatBot] Failed to load chat history:', err)
  }
}

// Save message to Supabase
async function saveMessage(role, content) {
  if (!auth.user) return
  try {
    await supabase.from('chat_history').insert({
      user_id: auth.user.id,
      role,
      content,
    })
  } catch (err) {
    console.warn('[ChatBot] Failed to save message:', err)
  }
}

// Clear chat history
async function clearHistory() {
  if (!auth.user) return
  try {
    await supabase.from('chat_history').delete().eq('user_id', auth.user.id)
    messages.value = []
  } catch (err) {
    console.warn('[ChatBot] Failed to clear history:', err)
  }
}

const canAccess = computed(() => ['Pro', 'VIP'].includes(auth.membershipName))
const isQuizBlocked = computed(() => auth.quizActive)

const quickReplies = [
  '¿Qué cursos hay disponibles?',
  '¿Qué cursos de emprendimiento hay?',
  '¿Cómo compro un curso?',
  'Planes de membresía',
  '¿Cómo ser instructor?',
  'Medios de pago',
]

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

async function sendMessage(text) {
  const content = text || inputText.value.trim()
  if (!content || isTyping.value) return

  error.value = null
  messages.value.push({ role: 'user', content })
  await saveMessage('user', content)
  inputText.value = ''
  isTyping.value = true
  scrollToBottom()

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      error.value = 'Necesitás iniciar sesión.'
      isTyping.value = false
      return
    }

    const { data, error: fnError } = await supabase.functions.invoke('chat-faq', {
      body: {
        messages: messages.value.slice(-20).map(m => ({ role: m.role, content: m.content })),
      },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    if (fnError) {
      console.error('[ChatBot] chat-faq invoke error:', fnError)
      const msg = fnError.message || fnError.error || ''
      if (msg.includes('403') || msg.includes('Membresía') || msg.includes('membresía')) {
        error.value = 'El chat es exclusivo para miembros Pro y VIP. Actualizá tu membresía para acceder.'
      } else if (msg.includes('401')) {
        error.value = 'Necesitás iniciar sesión para usar el chat.'
      } else {
        error.value = 'Error al conectar con el asistente. Intentá de nuevo.'
      }
      isTyping.value = false
      return
    }

    if (data?.error) {
      if (data.detail) console.error('[ChatBot] chat-faq detail:', data.detail)
      if (data.error.includes('Membresía') || data.error.includes('membresía')) {
        error.value = 'El chat es exclusivo para miembros Pro y VIP. Actualizá tu membresía para acceder.'
      } else {
        error.value = data.error
      }
    } else if (data?.reply) {
      messages.value.push({ role: 'assistant', content: data.reply })
      await saveMessage('assistant', data.reply)
    }
  } catch (err) {
    error.value = 'No se pudo conectar. Intentá de nuevo.'
  } finally {
    isTyping.value = false
    scrollToBottom()
  }
}

function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value && messages.value.length === 0) {
    loadChatHistory().then(() => {
      if (messages.value.length === 0) {
        messages.value.push({
          role: 'assistant',
          content: '¡Hola! Soy CoursBot, el asistente de CoursEd. ¿En qué puedo ayudarte?',
        })
      }
    })
  }
}

watch(isOpen, () => {
  if (isOpen.value) scrollToBottom()
})
</script>

<template>
  <!-- Floating button -->
  <button
    @click="toggle"
    :disabled="isQuizBlocked"
    :aria-label="isOpen ? 'Cerrar asistente' : 'Abrir asistente CoursBot'"
    class="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
    :class="[isQuizBlocked ? 'bg-slate-600 shadow-slate-600/30' : 'bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-indigo-500/30 hover:shadow-indigo-500/50', { 'rotate-0': !isOpen }]"
    :title="isQuizBlocked ? 'Chat deshabilitado durante el examen' : ''"
  >
    <!-- Chat icon -->
    <svg v-if="!isOpen" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.671 1.09-.085 2.17-.207 3.238-.364 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
    </svg>
    <!-- Close icon -->
    <svg v-else class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>

  <!-- Chat panel -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-4 opacity-0 scale-95"
      enter-to-class="translate-y-0 opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100 scale-100"
      leave-to-class="translate-y-4 opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex flex-col sm:inset-auto sm:bottom-24 sm:right-6 sm:w-[400px] sm:h-[560px] sm:rounded-2xl border border-slate-800 bg-surface shadow-2xl shadow-black/40"
      >
        <!-- Header -->
        <div class="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-sm font-bold text-white">
            C
          </div>
          <div class="flex-1">
            <p class="text-sm font-semibold text-white">CoursBot</p>
            <p class="text-xs text-slate-500">Asistente de CoursEd</p>
          </div>
          <span v-if="canAccess" class="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
            {{ auth.membershipName }}
          </span>
          <button @click="clearHistory" class="text-slate-500 hover:text-white transition" title="Limpiar historial">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
          <button @click="isOpen = false" class="text-slate-500 hover:text-white transition">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Quiz blocked state -->
        <div v-if="isQuizBlocked" class="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <svg class="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h3 class="mt-4 text-lg font-bold text-white">Chat deshabilitado</h3>
          <p class="mt-2 max-w-xs text-sm text-slate-400">El chat no está disponible durante evaluaciones para mantener la integridad académica.</p>
        </div>

        <!-- No access state -->
        <div v-else-if="!canAccess" class="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10">
            <svg class="h-8 w-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h3 class="mt-4 text-lg font-bold text-white">Chat exclusivo para Pro y VIP</h3>
          <p class="mt-2 max-w-xs text-sm text-slate-400">Actualizá tu membresía para acceder al asistente virtual.</p>
          <button
            @click="router.push('/pricing'); isOpen = false"
            class="mt-6 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Ver planes
          </button>
        </div>

        <!-- Chat state -->
        <template v-else>
          <!-- Messages -->
          <div ref="messagesContainer" class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <div v-for="(msg, i) in messages" :key="i" class="flex" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
              <div
                class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
                :class="msg.role === 'user'
                  ? 'rounded-br-sm bg-indigo-500/20 border border-indigo-500/30 text-slate-100'
                  : 'rounded-bl-sm bg-slate-800/80 border border-slate-700/50 text-slate-200'"
              >
                <!-- SECURITY: Using {{ }} interpolation (NOT v-html) to prevent XSS -->
                <span class="whitespace-pre-wrap">{{ msg.content }}</span>
              </div>
            </div>

            <!-- Typing indicator -->
            <div v-if="isTyping" class="flex justify-start">
              <div class="flex gap-1 rounded-2xl rounded-bl-sm bg-slate-800/80 border border-slate-700/50 px-4 py-3">
                <span class="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style="animation-delay: 0ms" />
                <span class="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style="animation-delay: 150ms" />
                <span class="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style="animation-delay: 300ms" />
              </div>
            </div>

            <!-- Error -->
            <div v-if="error" class="flex justify-center">
              <div class="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300">
                {{ error }}
              </div>
            </div>

            <!-- Quick replies (show only at start) -->
            <div v-if="messages.length <= 1 && !isTyping" class="flex flex-wrap gap-2 pt-2">
              <button
                v-for="qr in quickReplies"
                :key="qr"
                @click="sendMessage(qr)"
                class="rounded-full border border-slate-700/50 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-300 transition hover:border-indigo-500/40 hover:text-white"
              >
                {{ qr }}
              </button>
            </div>
          </div>

          <!-- Input -->
          <div class="border-t border-slate-800 p-3">
            <div class="flex gap-2">
              <input
                v-model="inputText"
                @keydown.enter="sendMessage()"
                :disabled="isTyping"
                class="flex-1 rounded-xl border border-slate-700/50 bg-slate-800/60 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
                placeholder="Escribí tu pregunta..."
              />
              <button
                @click="sendMessage()"
                :disabled="!inputText.trim() || isTyping"
                class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white transition hover:opacity-90 disabled:opacity-40"
              >
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>
