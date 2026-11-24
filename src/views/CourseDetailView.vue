<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getCourseBySlug, isUserEnrolled, getCourseStudentCount } from '@/services/courseService'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import { supabase } from '@/services/supabase'
import { formatCurrency } from '@/utils/format'

const props = defineProps({ slug: { type: String, required: true } })

const router = useRouter()
const auth   = useAuthStore()

const enrolled      = ref(false)
const studentCount  = ref(0)
const payLoading    = ref(false)
const payError      = ref(null)
const expandedMods  = ref({})
const showVideoModal = ref(false)
const descExpanded   = ref(false)

const loading = ref(true)
const error = ref(null)

const currentCourse = ref(null)
const course = computed(() => currentCourse.value)

// ── Discount logic: read from DB membership ──
const discountPercent = computed(() => {
  if (!auth.isAuthenticated) return 0
  return auth.membershipDiscount ?? 0
})
const basePrice = computed(() => Number(course.value?.price) || 0)
const finalPrice = computed(() => basePrice.value * (1 - discountPercent.value / 100))
const breadcrumbs = computed(() => {
  const items = [{ label: 'Inicio', to: '/' }, { label: 'Cursos', to: '/courses' }]
  if (loading.value && !course.value) {
    items.push({ label: '...' })
  } else if (course.value?.title) {
    items.push({ label: course.value.title })
  }
  return items
})
const hasDiscount = computed(() => discountPercent.value > 0 && basePrice.value > 0)
const isFree = computed(() => basePrice.value === 0)

// Level label
const levelLabel = computed(() => {
  const labels = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' }
  return labels[course.value?.level] ?? ''
})

// Language label
const languageLabel = computed(() => {
  const labels = { es: 'Español', en: 'Inglés', pt: 'Portugués', fr: 'Francés' }
  return labels[course.value?.language] ?? ''
})

// YouTube/Vimeo embed URL
const demoVideoEmbed = computed(() => {
  const url = course.value?.demo_video_url
  if (!url) return null
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/)
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  return url
})

// BUG-019: Stop iframe when modal closes
const videoModalSrc = ref(null)
watch(showVideoModal, (open) => {
  if (open) {
    videoModalSrc.value = demoVideoEmbed.value
  } else {
    videoModalSrc.value = null
  }
})

function onModalKeydown(e) {
  if (e.key === 'Escape' && showVideoModal.value) {
    showVideoModal.value = false
  }
}
onMounted(() => document.addEventListener('keydown', onModalKeydown))
onUnmounted(() => document.removeEventListener('keydown', onModalKeydown))

// Determinar si el usuario logueado es el creador/instructor de este curso
const isInstructor = computed(() => {
  if (!auth.isAuthenticated || !course.value) return false
  return auth.user?.id === course.value?.instructor_id
})

// Ruta a la primera lección del curso
const firstLessonRoute = computed(() => {
  if (!course.value) return null
  const firstLesson = course.value.modules
    ?.slice().sort((a, b) => a.order_index - b.order_index)[0]
    ?.lessons?.slice().sort((a, b) => a.order_index - b.order_index)[0]
  if (!firstLesson) return null
  return { name: 'Lesson', params: { courseId: course.value.id, lessonId: firstLesson.id } }
})

// Determinar si el botón de compra debe ocultarse o bloquearse
const canBuy = computed(() => {
  if (!auth.isAuthenticated) return true
  if (isInstructor.value) return false
  if (enrolled.value) return false
  return true
})

// BUG-M02 / BUG-L04: Format "Xm" or "Xh Ym"; return '' when duration is unknown (0) so it's never rendered
function totalDuration(lessons) {
  const secs = lessons?.reduce((acc, l) => acc + (l.duration_seconds || 0), 0) || 0
  if (secs <= 0) return ''
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// BUG-L04: course-level duration label (empty → badge hidden)
const courseDurationLabel = computed(() =>
  totalDuration(course.value?.modules?.flatMap(m => m.lessons || []) ?? [])
)

function toggleMod(id) {
  expandedMods.value[id] = !expandedMods.value[id]
}

async function handleBuy() {
  if (!auth.isAuthenticated) {
    router.push({ name: 'Register', query: { redirect: `/courses/${props.slug}` } })
    return
  }

  if (isFree.value) {
    await createFreeEnrollment()
    return
  }

  payLoading.value = true
  payError.value = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('Necesitas iniciar sesión para continuar con el pago.')
    }

    const { data: result, error: functionError } = await supabase.functions.invoke('create-payment', {
      body: { courseId: course.value.id },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    if (functionError) throw functionError

    const checkoutUrl = result?.checkout_url || result?.init_point
    if (!checkoutUrl) throw new Error('Mercado Pago no devolvió una URL de checkout.')
    window.location.href = checkoutUrl
  } catch (err) {
    payError.value = err.message
  } finally {
    payLoading.value = false
  }
}

async function createFreeEnrollment() {
  if (enrolled.value) return
  payLoading.value = true
  try {
    const { error } = await supabase.from('enrollments').insert({
      user_id: auth.user.id,
      course_id: course.value.id,
      amount_paid: 0,
      commission_fee: 0,
      status: 'active',
    })
    if (error) throw error
    enrolled.value = true
    studentCount.value++
  } catch (err) {
    payError.value = err.message
  } finally {
    payLoading.value = false
  }
}

// BUG-C04: Extract loading logic to a function so it can be re-run when slug changes
async function loadCourseData() {
  loading.value = true
  error.value = null
  try {
    const courseData = await getCourseBySlug(props.slug)
    if (courseData.error) throw new Error(courseData.error)
    
    currentCourse.value = courseData.data
    if (currentCourse.value) {
      const [enrolledRes, countRes] = await Promise.all([
        isUserEnrolled(currentCourse.value.id),
        getCourseStudentCount(currentCourse.value.id),
      ])
      enrolled.value = enrolledRes
      studentCount.value = countRes
      // Expand first module by default
      if (currentCourse.value.modules?.[0]) {
        expandedMods.value[currentCourse.value.modules[0].id] = true
      }
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(loadCourseData)

// BUG-C04: Watch slug changes so navigating /courses/a → /courses/b reloads data
watch(() => props.slug, () => {
  loadCourseData()
}, { immediate: false })
</script>

<template>
  <div class="min-h-screen">
    <!-- Loading skeleton -->
    <div v-if="loading" class="px-6 py-16">
      <div class="mx-auto max-w-6xl">
        <div class="grid gap-12 lg:grid-cols-[1fr_360px]">
          <!-- Left: skeleton info -->
          <div class="space-y-6">
            <div class="h-4 w-48 animate-pulse rounded bg-surface-lighter"></div>
            <div class="space-y-3">
              <div class="h-8 w-3/4 animate-pulse rounded bg-surface-lighter"></div>
              <div class="h-8 w-1/2 animate-pulse rounded bg-surface-lighter"></div>
            </div>
            <div class="h-4 w-full animate-pulse rounded bg-surface-lighter"></div>
            <div class="h-4 w-4/5 animate-pulse rounded bg-surface-lighter"></div>
            <div class="flex gap-6 pt-2">
              <div class="h-4 w-24 animate-pulse rounded bg-surface-lighter"></div>
              <div class="h-4 w-24 animate-pulse rounded bg-surface-lighter"></div>
              <div class="h-4 w-24 animate-pulse rounded bg-surface-lighter"></div>
            </div>
          </div>
          <!-- Right: skeleton card -->
          <div class="glass-card space-y-4 p-6">
            <div class="aspect-video animate-pulse rounded-lg bg-surface-lighter"></div>
            <div class="h-8 w-32 animate-pulse rounded bg-surface-lighter"></div>
            <div class="h-12 w-full animate-pulse rounded-xl bg-surface-lighter"></div>
          </div>
        </div>
        <!-- Skeleton modules -->
        <div class="mt-12 space-y-3">
          <div class="glass-card h-16 animate-pulse"></div>
          <div class="glass-card h-16 animate-pulse"></div>
          <div class="glass-card h-16 animate-pulse"></div>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="mx-auto max-w-lg px-6 py-32 text-center">
      <p class="text-error">{{ error }}</p>
      <RouterLink to="/courses" class="btn-primary mt-6 inline-block">Ver todos los cursos</RouterLink>
    </div>

    <!-- Content -->
    <div v-else-if="course">
      <!-- ── Hero ── -->
      <section class="relative overflow-hidden border-b border-surface-lighter bg-surface-light/40 px-6 py-16">
        <div class="pointer-events-none absolute inset-0">
          <div class="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/10 blur-[120px]" />
        </div>
        <div class="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_360px]">
          <!-- Left: info -->
          <div>
            <Breadcrumbs :items="breadcrumbs" />

            <h1 class="text-3xl font-extrabold leading-tight text-text-primary sm:text-4xl">
              {{ course.title }}
            </h1>
            <p class="mt-4 text-lg leading-relaxed text-text-secondary"
               :class="descExpanded ? '' : 'line-clamp-3'"
            >{{ course.description }}</p>
            <button v-if="course.description && course.description.length > 200"
              @click="descExpanded = !descExpanded"
              class="mt-1 text-sm font-medium text-primary hover:text-primary-light transition"
            >
              {{ descExpanded ? 'Leer menos' : 'Leer más' }}
            </button>

            <!-- Instructor -->
            <div v-if="course.profiles" class="mt-6 flex items-center gap-3">
              <div v-if="course.profiles.avatar_url" class="h-10 w-10 overflow-hidden rounded-full ring-2 ring-primary/20">
                <img :src="course.profiles.avatar_url" :alt="course.profiles.full_name" class="h-full w-full object-cover" />
              </div>
              <div v-else class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary-light">
                {{ course.profiles.full_name?.charAt(0) }}
              </div>
              <div>
                <p class="text-sm font-medium text-text-primary">{{ course.profiles.full_name }}</p>
                <p class="text-xs text-text-muted">Instructor</p>
              </div>
            </div>

            <!-- Stats row -->
            <div class="mt-6 flex flex-wrap gap-6 text-sm text-text-muted">
              <span class="flex items-center gap-1.5">
                <svg class="h-4 w-4 text-primary-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197" />
                </svg>
                {{ studentCount }} alumnos
              </span>
              <span class="flex items-center gap-1.5">
                <svg class="h-4 w-4 text-primary-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
                </svg>
                {{ course.modules?.length || 0 }} módulos
              </span>
              <!-- BUG-L04: duration only when > 0 (avoids "0m de contenido") -->
              <span v-if="courseDurationLabel" class="flex items-center gap-1.5">
                <svg class="h-4 w-4 text-primary-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                {{ courseDurationLabel }} de contenido
              </span>
            </div>
          </div>

          <!-- Right: purchase card -->
          <div class="glass-card h-fit p-6 lg:sticky lg:top-24 z-10">
            <!-- Thumbnail con overlay de Play -->
            <div 
              class="group relative mb-5 aspect-video cursor-pointer overflow-hidden rounded-lg bg-surface-lighter"
              @click="demoVideoEmbed && (showVideoModal = true)"
            >
              <img v-if="course.thumbnail_url" :src="course.thumbnail_url" :alt="course.title" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div v-else class="flex h-full items-center justify-center bg-surface-lighter text-text-muted">
                <svg class="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v.375" />
                </svg>
              </div>
              
              <!-- Overlay oscuro y botón de play al pasar el mouse -->
              <div v-if="demoVideoEmbed" class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100">
                <div class="flex h-14 w-14 items-center justify-center rounded-full bg-primary/90 text-white shadow-lg">
                  <svg class="ml-1 h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </div>

            <!-- Price -->
            <div class="mb-5">
              <div v-if="isFree">
                <span class="text-3xl font-extrabold text-success">Gratis</span>
              </div>
              <div v-else-if="hasDiscount" class="flex items-baseline gap-3">
                <span class="text-3xl font-extrabold text-primary-light">
                  {{ formatCurrency(finalPrice, course.currency) }}
                </span>
                <span class="text-lg text-text-muted line-through">
                  {{ formatCurrency(basePrice, course.currency) }}
                </span>
                <span class="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary-light">
                  -{{ discountPercent }}%
                </span>
              </div>
              <div v-else>
                <span class="text-3xl font-extrabold text-text-primary">
                  {{ formatCurrency(basePrice, course.currency) }}
                </span>
              </div>
              <p v-if="hasDiscount" class="mt-1 text-xs text-text-muted">
                Precio con tu membresía {{ auth.membershipName }}
              </p>
            </div>

 <!-- CTA -->
<div v-if="isInstructor || enrolled" class="space-y-3">
  <RouterLink
    v-if="firstLessonRoute"
    :to="firstLessonRoute"
    class="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base"
  >
    <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
    {{ isInstructor ? 'Ver curso' : 'Continuar aprendiendo' }}
  </RouterLink>
  <p class="text-center text-xs" :class="isInstructor ? 'text-violet-400' : 'text-success'">
    {{ isInstructor ? 'Sos el instructor de este curso' : '✓ Ya estás inscrito' }}
  </p>
</div>

<div v-else>
  <button
    @click="handleBuy"
    :disabled="payLoading"
    class="btn-primary w-full py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {{ payLoading ? 'Procesando...' : isFree ? 'Inscribirse gratis' : 'Comprar ahora' }}
  </button>
  <p v-if="!auth.isAuthenticated" class="mt-2 text-center text-xs text-text-muted">
    Necesitás una cuenta para comprar
  </p>
  <div v-if="payError" class="mt-3 rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-xs text-error">
    {{ payError }}
  </div>
</div>
          </div>
        </div>
      </section>

      <!-- ── Curriculum ── -->
      <section class="px-6 py-16 pb-28 lg:pb-16">
        <div class="mx-auto max-w-6xl lg:max-w-[calc(100%-360px-3rem)] lg:pr-0">
          <h2 class="mb-8 text-2xl font-bold text-text-primary">Contenido del curso</h2>

          <div v-if="course.modules?.length" class="space-y-3">
            <div
              v-for="mod in course.modules"
              :key="mod.id"
              class="glass-card overflow-hidden"
            >
              <!-- Module header -->
              <button
                @click="toggleMod(mod.id)"
                class="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-surface-lighter/30"
              >
                <div>
                  <p class="font-semibold text-text-primary">{{ mod.title }}</p>
                  <p class="mt-0.5 text-xs text-text-muted">
                    {{ mod.lessons?.length || 0 }} lecciones<template v-if="totalDuration(mod.lessons)"> · {{ totalDuration(mod.lessons) }}</template>
                  </p>
                </div>
                <svg
                  class="h-5 w-5 text-text-muted transition-transform duration-200"
                  :class="expandedMods[mod.id] ? 'rotate-180' : ''"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              <!-- Lessons list -->
              <div v-if="expandedMods[mod.id]" class="border-t border-surface-lighter">
                <div
                  v-for="lesson in mod.lessons"
                  :key="lesson.id"
                  class="flex items-center justify-between px-5 py-3 text-sm transition-colors hover:bg-surface-lighter/20"
                >
                  <div class="flex items-center gap-3">
                    <!-- lock/unlock icon -->
                    <svg v-if="lesson.is_free_preview || enrolled" class="h-4 w-4 shrink-0 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                    </svg>
                    <svg v-else class="h-4 w-4 shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                    <!-- type badge -->
                    <span v-if="lesson.lesson_type === 'pdf'" class="rounded border border-error/30 bg-error/10 px-1.5 py-0.5 text-[10px] font-medium text-error">PDF</span>
                    <span v-else-if="lesson.lesson_type === 'quiz'" class="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary-light">Quiz</span>
                    <span :class="lesson.is_free_preview || enrolled ? 'text-text-primary' : 'text-text-muted'">
                      {{ lesson.title }}
                    </span>
                    <span v-if="lesson.is_free_preview && !enrolled" class="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                      Vista previa
                    </span>
                  </div>
                  <span v-if="lesson.duration_seconds" class="shrink-0 text-xs text-text-muted">
                    {{ Math.floor(lesson.duration_seconds / 60) }}m
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="glass-card p-8 text-center text-text-muted">
            Este curso aún no tiene módulos publicados.
          </div>

          <!-- Course details: level, language, requirements, objectives -->
          <div class="mt-12 space-y-8">
            <!-- Level + Language badges -->
            <div v-if="levelLabel || languageLabel" class="flex flex-wrap gap-3">
              <span v-if="levelLabel" class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary-light">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                {{ levelLabel }}
              </span>
              <span v-if="languageLabel" class="inline-flex items-center gap-1.5 rounded-full bg-surface-lighter px-3 py-1.5 text-sm text-text-secondary">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                </svg>
                {{ languageLabel }}
              </span>
            </div>

            <!-- Requirements -->
            <div v-if="course.requirements?.trim()">
              <h2 class="mb-4 text-2xl font-bold text-text-primary">Requisitos</h2>
              <div class="glass-card p-6">
                <p class="whitespace-pre-line text-text-secondary">{{ course.requirements }}</p>
              </div>
            </div>

            <!-- Objectives -->
            <div v-if="course.objectives">
              <h2 class="mb-4 text-2xl font-bold text-text-primary">¿Qué aprenderás?</h2>
              <div class="glass-card p-6">
                <p class="whitespace-pre-line text-text-secondary">{{ course.objectives }}</p>
              </div>
            </div>
          </div>

          <!-- Instructor bio -->
          <div v-if="course.profiles?.bio" class="mt-12">
            <h2 class="mb-6 text-2xl font-bold text-text-primary">Sobre el instructor</h2>
            <div class="glass-card flex gap-5 p-6">
              <div v-if="course.profiles.avatar_url" class="h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-primary/20">
                <img :src="course.profiles.avatar_url" :alt="course.profiles.full_name" class="h-full w-full object-cover" />
              </div>
              <div v-else class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xl font-bold text-primary-light">
                {{ course.profiles.full_name?.charAt(0) }}
              </div>
              <div>
                <p class="font-semibold text-text-primary">{{ course.profiles.full_name }}</p>
                <p class="mt-2 text-sm leading-relaxed text-text-secondary">{{ course.profiles.bio }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
    <!-- Sticky Mobile Checkout Bar -->
<div 
  v-if="!loading && !error && course"
  class="fixed bottom-0 left-0 right-0 z-40 border-t border-surface-lighter bg-surface-dark/80 p-4 backdrop-blur-lg lg:hidden"
>
  <!-- Inscrito o instructor: ir directo al curso -->
  <RouterLink
    v-if="(enrolled || isInstructor) && firstLessonRoute"
    :to="firstLessonRoute"
    class="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm"
  >
    <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
    {{ isInstructor ? 'Ver curso' : 'Continuar aprendiendo' }}
  </RouterLink>
  <!-- No inscrito: mostrar precio + comprar -->
  <div v-else-if="!enrolled && !isInstructor" class="mx-auto flex max-w-md items-center justify-between gap-4">
    <div class="flex flex-col">
      <span v-if="hasDiscount" class="text-xs text-text-muted line-through">
        {{ formatCurrency(basePrice, course.currency) }}
      </span>
      <span class="text-lg font-extrabold text-primary-light">
        {{ isFree ? 'Gratis' : formatCurrency(finalPrice, course.currency) }}
      </span>
    </div>
    <button
      @click="handleBuy"
      :disabled="payLoading"
      class="btn-primary flex-1 py-2.5 text-sm"
    >
      {{ payLoading ? 'Procesando...' : isFree ? 'Inscribirse gratis' : 'Comprar ahora' }}
    </button>
  </div>
</div>
  </div>

  <!-- Video Modal -->
  <Teleport to="body">
    <div v-if="showVideoModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" @click.self="showVideoModal = false">
      <div class="relative w-full max-w-4xl aspect-video">
        <button @click="showVideoModal = false" class="absolute -top-10 right-0 text-white hover:text-gray-300">
          <svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <iframe 
          v-if="videoModalSrc" 
          :src="videoModalSrc" 
          class="h-full w-full rounded-lg"
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen
        />
      </div>
    </div>
  </Teleport>
</template>
