<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getPublishedCourses } from '@/services/courseService'
import CourseCard from '@/components/CourseCard.vue'
import { supabase } from '@/services/supabase'

// ─── State ───
const authStore = useAuthStore()
const courses = ref([])
const loading = ref(true)
const error = ref(null)
const searchQuery = ref('')
const totalCount = ref(0)

// Debounced search
let searchTimeout = null
const debouncedSearch = ref('')

// Autocomplete suggestions
const suggestions = ref([])
const suggestionsLoading = ref(false)
const showSuggestions = ref(false)
const router = useRouter()

let suggestionRequestId = 0
let suggestionDebounceTimer = null

function fetchSuggestionsDebounced(q) {
  clearTimeout(suggestionDebounceTimer)
  suggestionDebounceTimer = setTimeout(() => fetchSuggestions(q), 300)
}

async function fetchSuggestions(q) {
  const thisRequestId = ++suggestionRequestId
  suggestionsLoading.value = true
  suggestions.value = []
  if (!q || q.trim().length < 2) {
    suggestionsLoading.value = false
    return
  }

  const searchTerm = `%${q.trim()}%`

  const [coursesRes, instructorsRes] = await Promise.all([
    supabase
      .from('courses')
      .select('id,title,slug,thumbnail_url')
      .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`)
      .eq('status', 'published')
      .limit(6),
    supabase
      .from('profiles')
      .select('id,full_name,avatar_url')
      .ilike('full_name', searchTerm)
      .limit(6),
  ])

  if (thisRequestId !== suggestionRequestId) return

  const courseSuggestions = (coursesRes.data || []).map((c) => ({
    type: 'course',
    id: c.id,
    title: c.title,
    slug: c.slug,
    img: c.thumbnail_url || null,
  }))

  // Filter instructors to only those who have at least one published course
  let instructorSuggestions = []
  const matchedProfiles = instructorsRes.data || []
  if (matchedProfiles.length > 0) {
    const profileIds = matchedProfiles.map((p) => p.id)
    const { data: courseOwners } = await supabase
      .from('courses')
      .select('instructor_id', { count: 'exact', head: false })
      .in('instructor_id', profileIds)
      .eq('status', 'published')

    const ownersSet = new Set((courseOwners || []).map((r) => r.instructor_id))
    instructorSuggestions = matchedProfiles
      .filter((p) => ownersSet.has(p.id))
      .map((p) => ({ type: 'instructor', id: p.id, title: p.full_name, img: p.avatar_url || null }))
  }

  suggestions.value = [...courseSuggestions.slice(0,4), ...instructorSuggestions.slice(0,4)]
  suggestionsLoading.value = false
}

function handleSuggestionClick(s) {
  showSuggestions.value = false
  searchQuery.value = ''
  debouncedSearch.value = ''
  if (s.type === 'course') {
    router.push({ path: `/courses/${s.slug}` })
  } else {
    router.push({ path: `/instructors/${s.id}` })
  }
}

let hideSuggestionsTimer = null

function hideSuggestions() {
  clearTimeout(hideSuggestionsTimer)
  hideSuggestionsTimer = setTimeout(() => { showSuggestions.value = false }, 200)
}

watch(searchQuery, (val) => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    debouncedSearch.value = val
  }, 400)
})

onUnmounted(() => {
  clearTimeout(searchTimeout)
  clearTimeout(hideSuggestionsTimer)
})

watch(debouncedSearch, () => {
  loadCourses(false)
  fetchSuggestionsDebounced(debouncedSearch.value)
  showSuggestions.value = !!debouncedSearch.value
})

// ─── Stats (animated counters) ───
const globalCourseCount = ref(0)
const instructorCount = ref(0)
const studentCount = ref(0)
const animatedCourses = ref(0)
const animatedInstructors = ref(0)
const animatedStudents = ref(0)

const stats = computed(() => [
  { label: 'Cursos Disponibles', value: animatedCourses.value, icon: 'book' },
  { label: 'Instructores Activos', value: animatedInstructors.value, icon: 'users' },
  { label: 'Alumnos Inscritos', value: animatedStudents.value, icon: 'chart' },
])

function animateCounter(targetRef, targetValue, duration = 1200) {
  const start = targetRef.value
  const diff = targetValue - start
  if (diff === 0) return
  const startTime = performance.now()
  function step(currentTime) {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
    targetRef.value = Math.round(start + diff * eased)
    if (progress < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// ─── Data Fetching ───
async function loadCourses(updateCount = true) {
  loading.value = true
  error.value = null

  const result = await getPublishedCourses({
    search: debouncedSearch.value,
    sortBy: 'created_at',
    ascending: false,
    limit: 20,
  })

  if (result.error) {
    error.value = result.error
  } else {
    courses.value = result.data
    if (updateCount) totalCount.value = result.count ?? result.data.length
  }

  loading.value = false
}

async function loadGlobalCounts() {
  // Count published courses
  try {
    const { count: coursesCount } = await supabase
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')

    globalCourseCount.value = coursesCount ?? 0

    // Prefer server-side distinct count via RPC for large datasets
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('count_distinct_instructors')
      if (!rpcErr && typeof rpcData === 'number') {
        instructorCount.value = rpcData
      } else if (!rpcErr && Array.isArray(rpcData)) {
        // Some Supabase variants return numeric results as [{ count: x }]
        const val = rpcData[0]?.count ?? rpcData[0]
        const num = typeof val === 'number' ? val : Number(val)
        if (!isNaN(num)) instructorCount.value = num
      } else {
        // Fallback to client-side distinct calculation (small datasets)
        const { data: instructorsData, error: instrErr } = await supabase
          .from('courses')
          .select('instructor_id')
          .eq('status', 'published')

        if (!instrErr && Array.isArray(instructorsData) && instructorsData.length > 0) {
          const unique = new Set(instructorsData.map((r) => r.instructor_id))
          instructorCount.value = unique.size
        } else if (instrErr) {
          // If even the fallback fails, estimate from loaded courses on page
          console.warn('instructor count fallback error:', instrErr)
        }
      }
    } catch (err) {
      console.warn('rpc count_distinct_instructors error', err)
    }

    // Count active enrollments (students)
    const { count: enrollCount, error: enrollErr } = await supabase
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')

    studentCount.value = enrollCount ?? 0
    if (enrollErr) console.warn('enrollments count error:', enrollErr)
  } catch (err) {
    console.warn('loadGlobalCounts error', err)
  }

  // Animate counters after data loads
  animateCounter(animatedCourses, globalCourseCount.value)
  animateCounter(animatedInstructors, instructorCount.value)
  animateCounter(animatedStudents, studentCount.value)
}

onMounted(() => {
  loadCourses(true)
  loadGlobalCounts()
})

// ─── Discount banner logic ───
const discountBannerText = computed(() => {
  if (!authStore.isAuthenticated) return null
  const name = authStore.membershipName
  if (name === 'VIP') return '🔥 Tu membresía VIP te otorga 50% de descuento en todos los cursos'
  if (name === 'Pro') return '⚡ Tu membresía Pro te otorga 20% de descuento en todos los cursos'
  return null
})
</script>

<template>
  <div class="min-h-screen bg-surface">

    <!-- ═══════════════════════════════════════════ -->
    <!-- HERO SECTION                               -->
    <!-- ═══════════════════════════════════════════ -->
    <section class="relative overflow-hidden px-6 pt-24 pb-16 md:pt-32 md:pb-20">
      <!-- Background effects -->
      <div class="pointer-events-none absolute inset-0">
        <div class="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-600/15 blur-[120px]" />
        <div class="absolute -right-24 top-12 h-64 w-64 rounded-full bg-cyan-500/15 blur-[100px]" />
        <div class="absolute inset-0 opacity-[0.03]"
          style="background-image: linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px); background-size: 60px 60px;"
        />
      </div>

      <div class="relative mx-auto max-w-4xl text-center">
        <!-- Title -->
        <h1 class="text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-3xl md:text-5xl lg:text-6xl">
          Aprende a tu ritmo.
          <span class="block bg-gradient-to-r from-indigo-400 via-cyan-400 to-pink-500 bg-clip-text text-transparent">
            Enseña al mundo.
          </span>
        </h1>

        <!-- Subtitle -->
        <p class="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
          Cientos de cursos con descuentos exclusivos. Creá tu propia academia online en minutos.
        </p>

        <!-- Search bar -->
        <div class="relative mx-auto mt-8 max-w-xl">
          <svg class="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Buscar cursos o instructores..."
            class="w-full rounded-xl border border-slate-800 bg-slate-900/80 py-3 pl-12 pr-4 text-white placeholder-slate-500 shadow-lg outline-none backdrop-blur-md transition-all focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
            @blur="hideSuggestions"
          />
          <!-- Autocomplete dropdown -->
          <div v-if="showSuggestions" class="absolute left-0 right-0 mt-2 z-50 rounded-xl border border-slate-800 bg-slate-900 shadow-xl overflow-hidden">
            <div v-if="suggestionsLoading" class="p-4 text-sm text-slate-400">Buscando...</div>
            <template v-else>
              <div v-if="suggestions.length === 0" class="p-4 text-sm text-slate-400">No se encontraron resultados</div>
              <ul>
                <li v-for="s in suggestions" :key="s.type + '-' + s.id" @mousedown.prevent="handleSuggestionClick(s)" class="flex items-center gap-3 px-4 py-3 hover:bg-slate-800 cursor-pointer transition-colors">
                  <img v-if="s.img" :src="s.img" class="h-10 w-10 rounded-lg object-cover flex-shrink-0" :alt="s.title" />
                  <div v-else class="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-slate-400 text-sm font-semibold flex-shrink-0">
                    {{ s.title?.charAt(0) }}
                  </div>
                  <div class="flex flex-col text-left truncate">
                    <div class="text-sm font-medium text-white truncate">{{ s.title }}</div>
                    <div class="text-xs text-slate-500">{{ s.type === 'course' ? 'Curso' : 'Instructor' }}</div>
                  </div>
                </li>
              </ul>
            </template>
          </div>
        </div>

        <!-- CTA buttons -->
        <div v-if="!authStore.isAuthenticated" class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <RouterLink to="/register" class="w-full sm:w-auto rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:opacity-90">
            Empezar gratis
          </RouterLink>
          <RouterLink to="/pricing" class="w-full sm:w-auto rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition-all hover:border-slate-500 hover:text-white">
            Ver planes
          </RouterLink>
        </div>
        <div v-else class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <RouterLink to="/courses" class="w-full sm:w-auto rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-6 py-3 text-sm font-semibold text-white">
            Explorar cursos
          </RouterLink>
          <RouterLink to="/dashboard" class="w-full sm:w-auto rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition-all hover:border-slate-500 hover:text-white">
            Ir al dashboard
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════ -->
    <!-- STATS BAR                                  -->
    <!-- ═══════════════════════════════════════════ -->
    <section class="border-y border-slate-800 bg-slate-900/50 px-6 py-6">
      <div class="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 sm:gap-12">
        <div v-for="stat in stats" :key="stat.label" class="flex items-center gap-3 text-center">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">
            <svg v-if="stat.icon === 'book'" class="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
            <svg v-else-if="stat.icon === 'users'" class="h-5 w-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
            <svg v-else class="h-5 w-5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
          </div>
          <div class="text-left">
            <span class="block text-2xl font-extrabold text-white">{{ stat.value.toLocaleString() }}</span>
            <span class="text-sm text-slate-400">{{ stat.label }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════ -->
    <!-- COURSE CATALOG                             -->
    <!-- ═══════════════════════════════════════════ -->
    <section class="px-6 py-16">
      <div class="mx-auto max-w-6xl">
        <!-- Section header -->
        <div class="mb-8 flex items-end justify-between">
          <div>
            <h2 class="text-2xl font-extrabold text-white sm:text-3xl">Cursos Destacados</h2>
            <p class="mt-1 text-slate-400">Los más recientes de nuestros instructores</p>
          </div>
          <RouterLink v-if="courses.length > 0" to="/courses" class="hidden items-center gap-2 rounded-xl bg-indigo-500/10 px-4 py-2.5 text-sm font-semibold text-indigo-400 transition hover:bg-indigo-500/20 hover:text-indigo-300 sm:flex">
            Ver todos
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
          </RouterLink>
        </div>

        <!-- Loading skeletons -->
        <div v-if="loading" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="n in 6" :key="n" class="animate-pulse rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <div class="aspect-video rounded-xl bg-slate-800/80" />
            <div class="mt-4 space-y-3">
              <div class="h-4 w-3/4 rounded bg-slate-800" />
              <div class="h-3 w-full rounded bg-slate-800/60" />
            </div>
          </div>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
          <p class="text-red-400">{{ error }}</p>
          <button @click="loadCourses" class="mt-4 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            Reintentar
          </button>
        </div>

        <!-- Course grid -->
        <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <CourseCard v-for="course in courses" :key="course.id" :course="course" />
        </div>

        <!-- Empty state -->
        <div v-if="!loading && !error && courses.length === 0" class="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
          <p class="text-lg font-semibold text-white">Aún no hay cursos</p>
          <p class="mt-2 text-slate-400">Volvé pronto para ver el contenido disponible.</p>
        </div>

        <!-- Ver todos (mobile) -->
        <div v-if="courses.length > 0" class="mt-8 text-center sm:hidden">
          <RouterLink to="/courses" class="inline-flex items-center gap-2 rounded-xl bg-indigo-500/10 px-6 py-3 text-sm font-semibold text-indigo-400 transition hover:bg-indigo-500/20 hover:text-indigo-300">
            Ver todos los cursos
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════ -->
    <!-- CTA SECTION                                -->
    <!-- ═══════════════════════════════════════════ -->
    <section v-if="!authStore.isAuthenticated" class="px-6 pb-20">
      <div class="mx-auto max-w-4xl rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-900/30 via-slate-900 to-purple-900/30 p-10 text-center sm:p-14">
        <h2 class="text-2xl font-bold text-white sm:text-3xl">¿Listo para empezar?</h2>
        <p class="mx-auto mt-3 max-w-md text-slate-400">
          Creá tu cuenta gratis y accedé al catálogo completo con descuentos exclusivos.
        </p>
        <RouterLink to="/register" class="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:opacity-90">
          Crear cuenta gratis
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </RouterLink>
      </div>
    </section>

  </div>
</template>
