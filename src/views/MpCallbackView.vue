<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/services/supabase'

const router = useRouter()
const auth = useAuthStore()
const status = ref('loading') // loading | success | error
const errorMsg = ref('')

onMounted(async () => {
  const code = new URLSearchParams(window.location.search).get('code')
  if (!code) {
    status.value = 'error'
    errorMsg.value = 'No se recibió el código de autorización.'
    return
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    status.value = 'error'
    errorMsg.value = 'Tu sesión expiró. Iniciá sesión nuevamente.'
    setTimeout(() => router.push('/login'), 2000)
    return
  }

  const { error } = await supabase.functions.invoke('mp-oauth-callback', {
    body: { code },
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error) {
    status.value = 'error'
    errorMsg.value = error.message || 'Error al conectar cuenta de MercadoPago.'
    return
  }

  await auth.fetchProfile()
  status.value = 'success'
  redirectTimer = setTimeout(() => router.push('/profile'), 2500)
})

let redirectTimer = null
onUnmounted(() => {
  if (redirectTimer) clearTimeout(redirectTimer)
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-6">
    <div class="glass-card max-w-md w-full p-10 text-center space-y-4">

      <div v-if="status === 'loading'" class="space-y-4">
        <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p class="text-text-muted">Conectando tu cuenta de MercadoPago...</p>
      </div>

      <div v-else-if="status === 'success'" class="space-y-4">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/20">
          <svg class="h-7 w-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <p class="text-lg font-semibold text-text-primary">¡Cuenta conectada!</p>
        <p class="text-sm text-text-muted">Redirigiendo a tu perfil...</p>
      </div>

      <div v-else class="space-y-4">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-error/20">
          <svg class="h-7 w-7 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </div>
        <p class="text-lg font-semibold text-text-primary">Error al conectar</p>
        <p class="text-sm text-text-muted">{{ errorMsg }}</p>
        <button @click="$router.push('/profile')" class="btn-primary px-6 py-2">Volver al perfil</button>
      </div>

    </div>
  </div>
</template>
