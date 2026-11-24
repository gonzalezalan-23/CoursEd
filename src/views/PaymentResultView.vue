<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'

const route  = useRoute()
const router = useRouter()
const auth   = useAuthStore()

const status    = ref('checking') // 'checking' | 'success' | 'pending' | 'failure'
const courseSlug = ref(null)
const isMembership = route.query.type === 'membership'
const pendingTimers = []

function safeSetTimeout(fn, ms) {
  const id = setTimeout(fn, ms)
  pendingTimers.push(id)
  return id
}

onUnmounted(() => {
  pendingTimers.forEach(id => clearTimeout(id))
})

// MP Orders API redirige con ?collection_status=approved&payment_id=...
// MP Subscriptions redirige a back_url sin parámetros de estado
onMounted(async () => {
  const collectionStatus = route.query.collection_status
  const paymentId        = route.query.payment_id
  const courseSlugParam  = route.query.course_slug // Viene de back_urls

  // Si hay course_slug en los params, usarlo directamente
  if (courseSlugParam) {
    courseSlug.value = courseSlugParam
  }

  // Retorno de suscripción: no trae collection_status, solo confirmamos
  if (!collectionStatus && !paymentId) {
    status.value = 'pending'
    return
  }

  if (collectionStatus === 'approved' && paymentId && isMembership) {
    let attempts = 0
    const checkMembership = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { status.value = 'failure'; return }

      const { data } = await supabase
        .from('profiles')
        .select('membership_id')
        .eq('id', session.user.id)
        .single()

      if (data?.membership_id) {
        status.value = 'success'
        await auth.fetchProfile() // Refresh auth store with new membership
      } else if (attempts < 5) {
        attempts++
        safeSetTimeout(checkMembership, 1000)
      } else {
        status.value = 'pending'
      }
    }
    await checkMembership()
  } else if (collectionStatus === 'approved' && paymentId) {
    // Si no tenemos course_slug de los params, buscarlo en el enrollment más reciente
    if (!courseSlug.value) {
      let attempts = 0
      const check = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { status.value = 'failure'; return }

        const { data } = await supabase
          .from('enrollments')
          .select('course_id, course:courses(slug)')
          .eq('user_id', session.user.id)
          .order('enrolled_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (data?.course?.slug) {
          courseSlug.value = data.course.slug
          status.value = 'success'
        } else if (attempts < 5) {
          attempts++
          safeSetTimeout(check, 1000)
        } else {
          status.value = 'pending'
        }
      }
      await check()
    } else {
      // Ya tenemos el slug, solo esperamos un poco para que el webhook procese
      await new Promise(resolve => safeSetTimeout(resolve, 1000))
      status.value = 'success'
    }
  } else if (collectionStatus === 'pending' || collectionStatus === 'in_process') {
    status.value = 'pending'
  } else {
    status.value = 'failure'
  }
})
</script>

<template>
  <!-- BUG-L15: header is 64px (was calc(100vh-72px)) -->
  <div class="flex min-h-[calc(100vh-64px)] items-center justify-center px-6 py-16">
    <div class="glass-card w-full max-w-md p-10 text-center">

      <!-- Checking -->
      <div v-if="status === 'checking'">
        <div class="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p class="text-text-secondary">Verificando tu pago...</p>
      </div>

      <!-- Success -->
      <div v-else-if="status === 'success'">
        <div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
          <svg class="h-8 w-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <h1 class="text-2xl font-extrabold text-text-primary">¡Pago exitoso!</h1>
        <p v-if="isMembership" class="mt-3 text-text-secondary">Tu membresía fue procesada correctamente. Ya podés seguir navegando en la plataforma.</p>
        <p v-else class="mt-3 text-text-secondary">Tu inscripción fue procesada correctamente. Ya podés acceder al contenido del curso.</p>
        <div class="mt-8 flex flex-col gap-3">
          <RouterLink
            v-if="courseSlug"
            :to="`/courses/${courseSlug}`"
            class="btn-primary py-3 text-base"
          >
            Ir al curso
          </RouterLink>
          <RouterLink to="/dashboard" class="rounded-lg border border-surface-lighter py-3 text-sm text-text-secondary transition hover:border-primary/30 hover:text-text-primary">
            {{ isMembership ? 'Seguir navegando' : 'Ver mis cursos' }}
          </RouterLink>
        </div>
      </div>

      <!-- Pending -->
      <div v-else-if="status === 'pending'">
        <div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-warning/15">
          <svg class="h-8 w-8 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h1 class="text-2xl font-extrabold text-text-primary">Pago pendiente</h1>
        <p class="mt-3 text-text-secondary">Tu pago está siendo procesado. Te notificaremos cuando se confirme y podrás acceder al curso.</p>
        <RouterLink to="/dashboard" class="btn-primary mt-8 inline-block py-3">
          Ir al dashboard
        </RouterLink>
      </div>

      <!-- Failure -->
      <div v-else>
        <div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-error/15">
          <svg class="h-8 w-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 class="text-2xl font-extrabold text-text-primary">Pago fallido</h1>
        <p class="mt-3 text-text-secondary">No pudimos procesar tu pago. No se realizó ningún cargo. Podés intentarlo nuevamente.</p>
        <div class="mt-8 flex flex-col gap-3">
          <button @click="router.back()" class="btn-primary py-3 text-base">Intentar de nuevo</button>
          <RouterLink to="/courses" class="rounded-lg border border-surface-lighter py-3 text-sm text-text-secondary transition hover:border-primary/30 hover:text-text-primary">
            Ver cursos
          </RouterLink>
        </div>
      </div>

    </div>
  </div>
</template>
