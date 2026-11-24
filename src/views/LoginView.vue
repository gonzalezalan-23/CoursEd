<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()

const tab = computed(() => route.name === 'Register' || route.query.tab === 'register' ? 'register' : 'login')
const loading  = ref(false)
const error    = ref(null)

const form = ref({ fullName: '', email: '', password: '', confirm: '' })

const isLogin = computed(() => tab.value === 'login')

// BUG-M06 / BUG-L06: Translate common Supabase errors to Spanish
const errorMessages = {
  'Invalid login credentials': 'Email o contraseña incorrectos.',
  'User already registered': 'Este email ya está registrado.',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
  'Email not confirmed': 'Tu email aún no fue confirmado. Revisá tu bandeja de entrada.',
  'Signup requires a valid password': 'El registro requiere una contraseña válida.',
  'Unable to validate email address: invalid format': 'El formato del email no es válido.',
  'Password must be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
}
function translateError(message) {
  return errorMessages[message] || message
}

// BUG-M06: Track email confirmation state
const emailConfirmationSent = ref(false)

watch(() => route.name, () => {
  error.value = null
  emailConfirmationSent.value = false
  form.value = { fullName: '', email: '', password: '', confirm: '' }
})

function switchTab(t) {
  error.value = null
  emailConfirmationSent.value = false
  form.value = { fullName: '', email: '', password: '', confirm: '' }
  if (t === 'register') {
    router.replace({ name: 'Register' })
  } else {
    router.replace({ name: 'Login' })
  }
}

async function submit() {
  error.value = null

  if (!isLogin.value && form.value.password !== form.value.confirm) {
    error.value = 'Las contraseñas no coinciden.'
    return
  }

  loading.value = true
  try {
    if (isLogin.value) {
      await auth.signInWithEmail(form.value.email, form.value.password)
      const rawRedirect = route.query.redirect || '/dashboard'
      const redirect = typeof rawRedirect === 'string' && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/dashboard'
      router.push(redirect)
    } else {
      const { data } = await auth.signUpWithEmail(form.value.email, form.value.password, form.value.fullName)
      // BUG-M06: If no session returned, Supabase requires email confirmation
      if (!data?.session) {
        emailConfirmationSent.value = true
        loading.value = false
        return
      }
      const rawRedirect = route.query.redirect || '/dashboard'
      const redirect = typeof rawRedirect === 'string' && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/dashboard'
      const planQuery = route.query.plan ? { plan: route.query.plan } : {}
      router.push({ path: redirect, query: planQuery })
    }
  } catch (err) {
    error.value = translateError(err.message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <!-- BUG-L15: header is 64px (was calc(100vh-72px)) -->
  <div class="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-16">
    <!-- Background orbs -->
    <div class="pointer-events-none fixed inset-0 overflow-hidden">
      <div class="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-primary/10 blur-[120px]" />
      <div class="absolute -right-32 bottom-1/4 h-80 w-80 rounded-full bg-secondary/10 blur-[100px]" />
    </div>

    <div class="relative w-full max-w-md">
      <!-- Logo -->
      <div class="mb-8 text-center">
        <RouterLink to="/" class="text-2xl font-extrabold gradient-text">CoursEd</RouterLink>
        <p class="mt-2 text-sm text-text-muted">
          {{ isLogin ? 'Bienvenido de vuelta' : 'Crea tu cuenta gratuita' }}
        </p>
      </div>

      <div class="glass-card p-8">
        <!-- Tabs -->
        <div class="mb-8 flex rounded-lg bg-surface p-1">
          <button
            v-for="t in [{ key: 'login', label: 'Iniciar sesión' }, { key: 'register', label: 'Registrarse' }]"
            :key="t.key"
            @click="switchTab(t.key)"
            class="flex-1 rounded-md py-2 text-sm font-medium transition-all duration-200"
            :class="tab === t.key
              ? 'bg-primary text-white shadow'
              : 'text-text-muted hover:text-text-primary'"
          >
            {{ t.label }}
          </button>
        </div>

        <!-- Form -->
        <form @submit.prevent="submit" class="space-y-5">
          <!-- Full name (register only) -->
          <div v-if="!isLogin">
            <label class="mb-1.5 block text-sm font-medium text-text-secondary">Nombre completo</label>
            <input
              v-model="form.fullName"
              type="text"
              required
              placeholder="Tu nombre"
              class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-3 text-text-primary placeholder-text-muted outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <!-- Email -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text-secondary">Email</label>
            <input
              v-model="form.email"
              type="email"
              required
              placeholder="tu@email.com"
              class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-3 text-text-primary placeholder-text-muted outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <!-- Password -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text-secondary">Contraseña</label>
            <input
              v-model="form.password"
              type="password"
              required
              minlength="6"
              placeholder="Mínimo 6 caracteres"
              class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-3 text-text-primary placeholder-text-muted outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <!-- Confirm password (register only) -->
          <div v-if="!isLogin">
            <label class="mb-1.5 block text-sm font-medium text-text-secondary">Confirmar contraseña</label>
            <input
              v-model="form.confirm"
              type="password"
              required
              placeholder="Repetí tu contraseña"
              class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-3 text-text-primary placeholder-text-muted outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <!-- Error -->
          <div v-if="error" class="rounded-lg border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
            {{ error }}
          </div>

          <!-- BUG-M06: Email confirmation notice -->
          <div v-if="emailConfirmationSent" class="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
            Revisá tu email para confirmar tu cuenta. Una vez confirmado, volvé a iniciar sesión.
          </div>

          <!-- Submit -->
          <button
            type="submit"
            :disabled="loading"
            class="btn-primary w-full py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="loading">{{ isLogin ? 'Ingresando...' : 'Creando cuenta...' }}</span>
            <span v-else>{{ isLogin ? 'Iniciar sesión' : 'Crear cuenta' }}</span>
          </button>
        </form>

        <!-- Switch tab hint -->
        <p class="mt-6 text-center text-sm text-text-muted">
          {{ isLogin ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?' }}
          <button @click="switchTab(isLogin ? 'register' : 'login')" class="ml-1 font-medium text-primary-light hover:underline">
            {{ isLogin ? 'Registrate' : 'Iniciá sesión' }}
          </button>
        </p>
      </div>
    </div>
  </div>
</template>
