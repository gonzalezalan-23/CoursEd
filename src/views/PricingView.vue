<template>
  <div class="min-h-screen bg-surface text-slate-100">
    <section class="relative px-6 py-20">
      <div class="mx-auto max-w-6xl">
        <div class="mb-5 text-center">
          <p class="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-400">Planes y precios</p>
          <h1 class="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">
            Elige el plan ideal para tu aprendizaje y crecimiento.
          </h1>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="flex justify-center py-12">
          <div class="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>

        <!-- Plans -->
        <div v-else class="grid gap-6 lg:grid-cols-3">
          <div
            v-for="plan in plans"
            :key="plan.name"
            class="relative rounded-3xl border p-8 shadow-xl backdrop-blur-md transition-all duration-300"
            :class="plan.featured
              ? 'border-indigo-500/60 bg-indigo-500/10 shadow-indigo-500/20 ring-1 ring-indigo-500/30 scale-[1.03]'
              : 'border-slate-800/80 bg-slate-900/50 shadow-black/20'"
          >
            <!-- VIP badge -->
            <div v-if="plan.featured" class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-1 text-xs font-bold text-white shadow-lg shadow-indigo-500/30">
              Mejor valor
            </div>
            <div class="mb-6 text-sm font-semibold uppercase tracking-[0.24em]"
              :class="plan.featured ? 'text-indigo-300' : 'text-slate-400'"
            >
              {{ plan.name }}
              <span v-if="plan.popular" class="ml-2 inline-flex items-center rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300">Popular</span>
              <span v-if="isCurrentPlan(plan.name)" class="ml-2 inline-flex items-center rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-bold text-success">Actual</span>
            </div>
            <div class="flex items-end gap-2">
              <span class="text-4xl font-extrabold text-slate-100">
                {{ plan.price === 0 ? '$0' : formatCurrency(plan.price, plan.currency) }}
              </span>
              <span v-if="plan.price > 0" class="text-sm text-slate-400">/mes</span>
            </div>
            <p class="mt-4 text-sm" :class="plan.featured ? 'text-slate-300' : 'text-slate-400'">
              {{ plan.description }}
            </p>
            <ul class="mt-6 space-y-3 text-sm" :class="plan.featured ? 'text-slate-200' : 'text-slate-300'">
              <li v-for="feature in plan.features" :key="feature" class="flex items-center gap-2">
                <svg class="h-4 w-4 shrink-0" :class="plan.featured ? 'text-indigo-400' : 'text-slate-500'" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                {{ feature }}
              </li>
            </ul>
            <button
              v-if="plan.price === 0"
              @click="router.push(isAuthenticated ? '/dashboard' : '/register')"
              class="mt-8 w-full rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              {{ isAuthenticated ? 'Ir al dashboard' : 'Comenzar gratis' }}
            </button>
            <button
              v-else
              @click="purchasePlan(plan.name)"
              :disabled="(loading2 && planLoading === plan.name) || isCurrentPlan(plan.name)"
              class="mt-8 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
              :class="plan.featured
                ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 hover:opacity-90'
                : 'bg-slate-800 hover:bg-slate-700'"
            >
              <span v-if="loading2 && planLoading === plan.name">Procesando...</span>
              <span v-else-if="isCurrentPlan(plan.name)">Plan actual</span>
              <span v-else-if="isDowngrade(plan.name)">Cambiar al mes siguiente</span>
              <span v-else>Elegir {{ plan.name }}</span>
            </button>
          </div>
        </div>

        <!-- Current plan notice -->
        <div v-if="isAuthenticated && currentPlan" class="mt-8 text-center">
          <p class="text-sm text-slate-400">
            Tu plan actual: <span class="font-semibold text-white">{{ currentPlan }}</span>
          </p>
        </div>
      </div>
    </section>

    <!-- Error message -->
    <div v-if="error" class="mx-auto max-w-2xl px-6 pb-10">
      <div class="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-300">
        {{ error }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/composables/useConfirm'
import { formatCurrency } from '@/utils/format'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { confirm } = useConfirm()

// BUG-M09: loading starts true so spinner shows during initial fetch
const loading = ref(true)
const loading2 = ref(false)
const planLoading = ref(null)
const error = ref(null)
const memberships = ref([])

const isAuthenticated = computed(() => auth.isAuthenticated)
const currentPlan = computed(() => auth.membershipName)

const planMeta = {
  Básico: {
    description: 'Acceso libre al catálogo básico de cursos y recursos gratuitos.',
    features: ['Acceso a cursos gratuitos', 'Soporte básico', 'Comunidad abierta'],
    featured: false,
  },
  Pro: {
    description: 'Acceso a todo el catálogo, descuentos adicionales y soporte prioritario.',
    features: ['Acceso completo a cursos', 'Capacitaciones exclusivas', 'Soporte prioritario'],
    featured: false,
    popular: true,
  },
  VIP: {
    description: 'Todo incluido con beneficios exclusivos, mentoría y mayores descuentos.',
    features: ['Acceso total + mentoría', 'Descuentos de hasta 50%', 'Eventos y clases en vivo'],
    featured: true,
  },
}

const plans = computed(() =>
  memberships.value.map(m => {
    const metaKey = Object.keys(planMeta).find(k => k.toLowerCase() === m.name?.toLowerCase()) || m.name
    const meta = planMeta[metaKey] || {}
    return {
      ...m,
      description: meta.description || '',
      features: meta.features || [],
      featured: meta.featured || false,
      popular: meta.popular || false,
    }
  })
)

const isCurrentPlan = (planName) => currentPlan.value?.toLowerCase() === planName?.toLowerCase()

const planRank = { 'básico': 0, 'basico': 0, 'pro': 1, 'vip': 2 }
const isDowngrade = (planName) => {
  if (!currentPlan.value) return false
  const currentRank = planRank[currentPlan.value.toLowerCase()] ?? 0
  const newRank = planRank[planName?.toLowerCase()] ?? 0
  return newRank < currentRank
}

async function purchasePlan(plan) {
  error.value = null
  if (!auth.isAuthenticated) {
    router.push({ name: 'Register', query: { redirect: '/pricing', plan, tab: 'register' } })
    return
  }
  if (loading2.value) return

  const planData = plans.value.find(p => p.name === plan)
  const isUpgrade = currentPlan.value && currentPlan.value !== 'Básico' && plan !== 'Básico'
  // BUG-M09: Rename inner variable to avoid shadowing the outer isDowngrade function
  const isVipDowngrade = currentPlan.value === 'VIP' && plan !== 'VIP'

  const confirmed = await confirm({
    title: isVipDowngrade ? 'Cambiar de plan' : isUpgrade ? 'Mejorar plan' : 'Confirmar plan',
    message: isVipDowngrade
      ? `Vas a cambiar de ${currentPlan.value} a ${plan}. Los beneficios actuales se perderán al finalizar el período.`
      : isUpgrade
        ? `Vas a mejorar tu plan de ${currentPlan.value} a ${plan}. Se activarán los nuevos beneficios inmediatamente.`
        : `Vas a suscribirte al plan ${plan}. Serás redirigido a Mercado Pago para completar el pago.`,
    confirmText: isVipDowngrade ? 'Cambiar plan' : 'Continuar al pago',
    cancelText: 'Cancelar',
    variant: isVipDowngrade ? 'warning' : 'info',
  })
  if (!confirmed) return

  loading2.value = true
  planLoading.value = plan
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('Necesitas iniciar sesión para continuar con el pago.')
    }

    const { data: result, error: functionError } = await supabase.functions.invoke('create-payment', {
      body: { plan },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    if (functionError) throw functionError

    const checkoutUrl = result?.checkout_url || result?.init_point
    if (!checkoutUrl) throw new Error('Mercado Pago no devolvió una URL de checkout.')
    window.location.href = checkoutUrl
  } catch (err) {
    error.value = err.message || 'Error al crear la preferencia de pago'
  } finally {
    loading2.value = false
    planLoading.value = null
  }
}

onMounted(async () => {
  // BUG-M09: loading is already true from init; handle errors
  try {
    const { data, error: err } = await supabase
      .from('memberships')
      .select('*')
      .order('price', { ascending: true })
    if (err) throw err
    memberships.value = data || []
  } catch (err) {
    error.value = 'No se pudieron cargar los planes. Intentá de nuevo más tarde.'
  } finally {
    loading.value = false
  }

  // Retomar plan elegido antes del registro
  const pendingPlan = route.query.plan
  if (pendingPlan && auth.isAuthenticated) {
    const matched = memberships.value.find(m => m.name?.toLowerCase() === String(pendingPlan).toLowerCase())
    if (matched && !isCurrentPlan(matched.name)) {
      purchasePlan(matched.name)
    }
  }
})
</script>
