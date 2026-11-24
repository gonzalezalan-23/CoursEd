<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/composables/useConfirm'
import { supabase } from '@/services/supabase'
import { formatCurrency } from '@/utils/format'

const auth    = useAuthStore()
const { confirm } = useConfirm()
const loading = ref(false)
const saving  = ref(false)
const success = ref(false)
const error   = ref(null)

// Password change state
const newPassword = ref('')
const confirmPassword = ref('')
const pwdLoading = ref(false)
const pwdSuccess = ref(false)
const pwdError = ref(null)

const memberships = ref([])
const form = ref({ full_name: '', bio: '', avatar_url: '' })
const pendingTimers = []

function safeSetTimeout(fn, ms) {
  const id = setTimeout(fn, ms)
  pendingTimers.push(id)
  return id
}

onUnmounted(() => { pendingTimers.forEach(id => clearTimeout(id)) })

const membershipBadgeClass = (name) => {
  if (name === 'VIP') return 'border-amber-500/30 bg-amber-500/10 text-amber-400'
  if (name === 'Pro') return 'border-violet-500/30 bg-violet-500/10 text-violet-400'
  return 'border-surface-lighter bg-surface-light text-text-muted'
}

const currentMembershipId = computed(() => auth.profile?.membership_id)

async function saveProfile() {
  saving.value = true
  error.value = null
  success.value = false
  try {
    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name:  form.value.full_name,
        bio:        form.value.bio,
        avatar_url: form.value.avatar_url || null,
      })
      .eq('id', auth.user.id)

    if (err) throw err
    await auth.fetchProfile()
    success.value = true
    safeSetTimeout(() => success.value = false, 3000)
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function changeMembership(membershipId) {
  if (membershipId === currentMembershipId.value) return

  const membership = memberships.value.find(item => item.id === membershipId)
  if (!membership) return

  const confirmed = await confirm({
    title: 'Cambiar membresía',
    message: `¿Querés cambiar a la membresía "${membership.name}"? ${Number(membership.price) === 0 ? 'Es gratis.' : `Costará ${formatCurrency(membership.price)}/mes.`}`,
    confirmText: Number(membership.price) === 0 ? 'Activar gratis' : 'Ir a pagar',
    cancelText: 'Cancelar',
    variant: 'warning',
  })
  if (!confirmed) return

  saving.value = true
  error.value = null
  try {

    if (Number(membership.price) === 0) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ membership_id: membershipId, membership_expires_at: null })
        .eq('id', auth.user.id)
      if (updateError) throw updateError
      await auth.fetchProfile()
      success.value = true
      safeSetTimeout(() => success.value = false, 3000)
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Necesitas iniciar sesión para continuar con el pago.')

    const { data: result, error: functionError } = await supabase.functions.invoke('create-payment', {
      body: { plan: membership.name },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    if (functionError) throw functionError
    const checkoutUrl = result?.checkout_url || result?.init_point
    if (!checkoutUrl) throw new Error('Mercado Pago no devolvió una URL de checkout.')
    window.location.href = checkoutUrl
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function changePassword() {
  pwdError.value = null
  if (!newPassword.value || newPassword.value.length < 6) {
    pwdError.value = 'La contraseña debe tener al menos 6 caracteres.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    pwdError.value = 'Las contraseñas no coinciden.'
    return
  }

  pwdLoading.value = true
  try {
    const { data, error: err } = await supabase.auth.updateUser({ password: newPassword.value })
    if (err) throw err
    pwdSuccess.value = true
    newPassword.value = ''
    confirmPassword.value = ''
    safeSetTimeout(() => pwdSuccess.value = false, 3000)
  } catch (err) {
    pwdError.value = err.message || String(err)
  } finally {
    pwdLoading.value = false
  }
}

function connectMP() {
  const clientId = import.meta.env.VITE_MP_CLIENT_ID
  const redirectUri = import.meta.env.VITE_MP_REDIRECT_URI || `${window.location.origin.replace(/\/$/, '')}/mp/callback`

  if (!clientId || !redirectUri) {
    error.value = 'Falta configurar la conexión con Mercado Pago.'
    return
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: redirectUri,
  })
  window.location.href = `https://auth.mercadopago.com.ar/authorization?${params}`
}

async function disconnectMP() {
  const confirmed = await confirm({
    title: 'Desvincular MercadoPago',
    message: '¿Querés desvincular tu cuenta de MercadoPago de esta plataforma?',
    confirmText: 'Desvincular',
    variant: 'warning',
  })
  if (!confirmed) return

  saving.value = true
  error.value = null
  try {
    const { error: err } = await supabase
      .from('profiles')
      .update({ mp_access_token: null, mp_user_id: null })
      .eq('id', auth.user.id)

    if (err) throw err
    await auth.fetchProfile()
    success.value = true
    safeSetTimeout(() => success.value = false, 3000)
  } catch (err) {
    error.value = err.message || 'No se pudo desvincular la cuenta de MercadoPago.'
  } finally {
    saving.value = false
  }
}

async function signOut() {
  const confirmed = await confirm({
    title: 'Cerrar sesión',
    message: '¿Estás seguro que deseas cerrar sesión? Tendrás que volver a iniciar sesión para acceder a tu cuenta.',
    confirmText: 'Cerrar sesión',
    cancelText: 'Cancelar',
    variant: 'danger',
  })
  if (!confirmed) return

  try {
    await auth.signOut()
  } catch (err) {
    console.error('Error al cerrar sesión:', err)
  }
}


onMounted(async () => {
  loading.value = true
  const { data } = await supabase
    .from('memberships')
    .select('*')
    .order('price', { ascending: true })

  memberships.value = data || []

  if (auth.profile) {
    form.value = {
      full_name:  auth.profile.full_name  || '',
      bio:        auth.profile.bio        || '',
      avatar_url: auth.profile.avatar_url || '',
    }
  }
  loading.value = false
})
</script>

<template>
  <div class="min-h-screen px-6 py-12">
    <div class="mx-auto max-w-3xl space-y-8">

      <div>
        <h1 class="text-3xl font-extrabold text-text-primary">Mi perfil</h1>
        <p class="mt-1 text-text-muted">Gestioná tu información personal y membresía</p>
      </div>

      <div v-if="loading" class="flex justify-center py-20">
        <div class="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>

      <template v-else>
        <!-- ── Profile form ── -->
        <div class="glass-card p-8">
          <h2 class="mb-6 text-lg font-semibold text-text-primary">Información personal</h2>

          <form @submit.prevent="saveProfile" class="space-y-5">
            <!-- Avatar preview -->
            <div class="flex items-center gap-5">
              <div class="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-primary/20 ring-2 ring-primary/20">
                <img v-if="form.avatar_url" :src="form.avatar_url" alt="Avatar" class="h-full w-full object-cover" @error="form.avatar_url = ''" />
                <div v-else class="flex h-full w-full items-center justify-center text-xl font-bold text-primary-light">
                  {{ form.full_name?.charAt(0)?.toUpperCase() || '?' }}
                </div>
              </div>
              <div class="flex-1">
                <label class="mb-1.5 block text-sm font-medium text-text-secondary">URL de avatar</label>
                <input
                  v-model="form.avatar_url"
                  type="url"
                  placeholder="https://..."
                  class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                />
              </div>
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-medium text-text-secondary">Nombre completo</label>
              <input
                v-model="form.full_name"
                type="text"
                required
                class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-3 text-text-primary placeholder-text-muted outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
              />
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-medium text-text-secondary">Bio</label>
              <textarea
                v-model="form.bio"
                rows="3"
                placeholder="Contá algo sobre vos..."
                class="w-full resize-none rounded-lg border border-surface-lighter bg-surface px-4 py-3 text-sm text-text-primary placeholder-text-muted outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
              />
            </div>

            <div v-if="error" class="rounded-lg border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">{{ error }}</div>
            <div v-if="success" class="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">✓ Cambios guardados correctamente</div>

            <button type="submit" :disabled="saving" class="btn-primary px-8 py-2.5 disabled:opacity-50">
              {{ saving ? 'Guardando...' : 'Guardar cambios' }}
            </button>
          </form>
        </div>

        <!-- ── Membership ── -->
        <div class="glass-card p-8">
          <h2 class="mb-2 text-lg font-semibold text-text-primary">Membresía</h2>
          <p class="mb-6 text-sm text-text-muted">Tu membresía determina los descuentos que recibís al comprar y la comisión que pagás al vender.</p>

          <div class="grid gap-4 sm:grid-cols-3">
            <div
              v-for="m in memberships"
              :key="m.id"
              @click="changeMembership(m.id)"
              class="relative cursor-pointer rounded-xl border p-5 transition-all duration-200"
              :class="m.id === currentMembershipId
                ? 'border-primary/50 bg-primary/10 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                : 'border-surface-lighter hover:border-primary/30 hover:bg-surface-lighter/30'"
            >
              <!-- Active indicator -->
              <div v-if="m.id === currentMembershipId" class="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                <svg class="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>

              <span class="inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold" :class="membershipBadgeClass(m.name)">
                {{ m.name }}
              </span>

              <p class="mt-3 text-xl font-extrabold text-text-primary">
                {{ m.price === 0 ? 'Gratis' : formatCurrency(m.price) + '/mes' }}
              </p>

              <ul class="mt-3 space-y-1.5 text-xs text-text-muted">
                <li>{{ m.discount_percentage ?? 0 }}% descuento al comprar</li>
                <li>{{ m.commission_percentage ?? 0 }}% comisión al vender</li>
                <li>Hasta {{ m.max_courses_allowed >= 9999 ? 'ilimitados' : m.max_courses_allowed }} cursos</li>
                <li>{{ m.max_students_per_course ? `Hasta ${m.max_students_per_course} alumnos` : 'Alumnos ilimitados' }}</li>
              </ul>
            </div>
          </div>

          <p class="mt-4 text-xs text-text-muted">
            Seleccioná un plan para iniciar el pago. La membresía cambia después de la confirmación.
          </p>
        </div>

        <!-- ── MercadoPago connect (instructores) ── -->
        <div v-if="auth.isInstructor" class="glass-card p-8">
          <h2 class="mb-2 text-lg font-semibold text-text-primary">MercadoPago</h2>
          <p class="mb-6 text-sm text-text-muted">Conectá tu cuenta de MP para recibir pagos de tus cursos.</p>

          <!-- BUG-C03: Use mp_user_id (selected from DB) instead of mp_access_token (deleted in auth.js) -->
          <div v-if="auth.profile?.mp_user_id" class="flex items-center gap-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-success/20">
              <svg class="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <span class="text-sm text-success">Cuenta conectada</span>
            <button
              @click="disconnectMP"
              :disabled="saving"
              class="ml-auto rounded border border-error/30 px-3 py-1.5 text-xs text-error transition hover:bg-error/10 disabled:opacity-50"
            >
              {{ saving ? 'Desvinculando...' : 'Desvincular' }}
            </button>
          </div>

          <button v-else @click="connectMP" class="btn-primary px-6 py-2.5">
            Conectar cuenta de MercadoPago
          </button>
        </div>

        <!-- ── Account info ── -->
        <div class="glass-card p-8">
          <h2 class="mb-4 text-lg font-semibold text-text-primary">Cuenta</h2>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between">
              <span class="text-text-muted">Nombre</span>
              <span class="text-text-primary">{{ auth.profile?.full_name }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Rol</span>
              <span class="capitalize text-text-primary">{{ auth.profile?.role }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Miembro desde</span>
              <span class="text-text-primary">
                {{ auth.profile?.created_at ? new Date(auth.profile.created_at).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A' }}
              </span>
            </div>
          </div>
        </div>

        <!-- ── Change password & logout ── -->
        <div class="glass-card p-8">
          <h2 class="mb-4 text-lg font-semibold text-text-primary">Seguridad</h2>

          <form @submit.prevent="changePassword" class="space-y-4">
            <div>
              <label class="mb-1.5 block text-sm font-medium text-text-secondary">Nueva contraseña</label>
              <input v-model="newPassword" type="password" minlength="6" class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-text-primary" />
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium text-text-secondary">Confirmar contraseña</label>
              <input v-model="confirmPassword" type="password" minlength="6" class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-text-primary" />
            </div>

            <div v-if="pwdError" class="text-sm text-error">{{ pwdError }}</div>
            <div v-if="pwdSuccess" class="text-sm text-success">✓ Contraseña actualizada</div>

            <div class="flex items-center gap-3">
              <button type="submit" :disabled="pwdLoading" class="btn-primary px-4 py-2.5">{{ pwdLoading ? 'Actualizando...' : 'Cambiar contraseña' }}</button>
              <button type="button" @click="signOut" class="ml-auto rounded-lg border border-pink-500/30 bg-pink-500/10 px-4 py-2.5 text-sm font-medium text-pink-400 transition hover:bg-pink-500/20 hover:text-pink-300">
                Cerrar sesión
              </button>
            </div>
          </form>
        </div>
      </template>

    </div>
  </div>
</template>
