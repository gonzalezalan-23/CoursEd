<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/services/supabase'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import Footer from '@/components/Footer.vue'

const route  = useRoute()
const router = useRouter()
const auth   = useAuthStore()

const course  = ref(null)
const lesson  = ref(null)
const loading = ref(true)
const error   = ref(null)
const completedLessons = ref(new Set())
const moduleOpenState  = ref({})

const quizAnswers   = ref({})
const quizSubmitted = ref(false)
const quizScore     = ref(null)
const sidebarOpen   = ref(false)

const completedLessonsKey = () => `user-${auth.user?.id ?? 'guest'}-course-${route.params.courseId}-completedLessons`
const expandedModulesKey  = () => `user-${auth.user?.id ?? 'guest'}-course-${route.params.courseId}-expandedModules`

const allLessons = computed(() => course.value?.modules?.flatMap(m => m.lessons ?? []) ?? [])
const currentIdx = computed(() => allLessons.value.findIndex(l => l.id === lesson.value?.id))
const prevLesson = computed(() => allLessons.value[currentIdx.value - 1] ?? null)
const nextLesson = computed(() => allLessons.value[currentIdx.value + 1] ?? null)
const progressPercent = computed(() => {
  const total = allLessons.value.length
  return total ? Math.round((completedLessons.value.size / total) * 100) : 0
})
const breadcrumbs = computed(() => {
  const items = [{ label: 'Inicio', to: '/' }, { label: 'Cursos', to: '/courses' }]
  if (loading.value && !course.value) {
    items.push({ label: '...' })
  } else if (course.value?.title) {
    items.push({ label: course.value.title, to: `/courses/${course.value.slug || course.value.id}` })
  }
  if (lesson.value?.title) items.push({ label: lesson.value.title })
  return items
})
const expandedModules = computed(() => {
  if (!course.value) return {}
  return Object.fromEntries(
    course.value.modules.map((m) => [m.id, moduleOpenState.value[m.id] ?? true])
  )
})
const isCurrentLessonCompleted = computed(() => lesson.value && completedLessons.value.has(lesson.value.id))
const isQuizLesson = computed(() => lesson.value?.lesson_type === 'quiz')
const quizPassed = computed(() => quizScore.value !== null && quizScore.value >= 70)
const canCompleteCurrentLesson = computed(() => {
  if (!lesson.value || isCurrentLessonCompleted.value) return false
  if (isQuizLesson.value) return quizPassed.value
  return true
})
const canAdvance = computed(() => isCurrentLessonCompleted.value)
const courseCompleted = computed(() => progressPercent.value === 100 && allLessons.value.length > 0)
const showCompletionModal = ref(false)
const showCertificateModal = ref(false)
const videoPlaying = ref(false)
const statusMessage = ref('')
// BUG-C02: Auto-clear statusMessage after 5s
let statusMessageTimer = null
function setStatusMessage(msg) {
  statusMessage.value = msg
  if (statusMessageTimer) clearTimeout(statusMessageTimer)
  statusMessageTimer = setTimeout(() => { statusMessage.value = '' }, 5000)
}
const studentName = computed(() => auth.profile?.full_name ?? 'Estudiante')
const completionDate = computed(() => new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }))
const instructorName = computed(() => course.value?.profiles?.full_name ?? 'Instructor')
const certificateId = computed(() => {
  const timestamp = Date.now().toString(36).toUpperCase()
  const courseId = course.value?.id?.slice(0, 8) || '00000000'
  return `CE-${courseId}-${timestamp}`
})
const verificationUrl = computed(() => {
  if (typeof window === 'undefined') return ''
  // BUG-M04: Point QR to the course page (exists) instead of non-existent /verify/:id route
  const slug = course.value?.slug || course.value?.id || ''
  return `${window.location.origin}/courses/${slug}`
})

const embedUrl = computed(() => {
  if (!lesson.value || lesson.value.lesson_type !== 'video') return null
  const { video_provider, video_url } = lesson.value
  if (!video_url) return null

  if (video_provider === 'youtube') {
    const match = video_url.match(/(?:[?&]v=|youtu\.be\/|embed\/|shorts\/|watch\?v=)([A-Za-z0-9_-]{11})/)
    const videoId = match ? match[1] : video_url.trim()
    if (videoId.length !== 11) return video_url.trim()
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&enablejsapi=0&origin=${encodeURIComponent(origin)}`
  }
  if (video_provider === 'vimeo') {
    const match = video_url.match(/vimeo\.com\/(\d+)/)
    const id = match ? match[1] : video_url.trim()
    return `https://player.vimeo.com/video/${id}?title=0&byline=0&portrait=0`
  }
  return video_url
})

const youtubeVideoId = computed(() => {
  if (!lesson.value || lesson.value.video_provider !== 'youtube') return null
  const match = lesson.value.video_url?.match(/(?:[?&]v=|youtu\.be\/|embed\/|shorts\/|watch\?v=)([A-Za-z0-9_-]{11})/)
  return match ? match[1] : lesson.value.video_url?.trim().length === 11 ? lesson.value.video_url.trim() : null
})

const youtubeWatchUrl = computed(() => {
  const id = youtubeVideoId.value
  return id ? `https://www.youtube.com/watch?v=${id}` : null
})

const youtubePlayerReady = ref(false)
let youtubePlayer = null
let youtubeApiLoaded = false

function loadYoutubeApi() {
  if (youtubeApiLoaded || typeof window.YT !== 'undefined') {
    initYoutubePlayer()
    return
  }
  youtubeApiLoaded = true
  const tag = document.createElement('script')
  tag.src = 'https://www.youtube.com/iframe_api'
  document.head.appendChild(tag)
  window.onYouTubeIframeAPIReady = initYoutubePlayer
}

function initYoutubePlayer() {
  const container = document.getElementById('youtube-player-container')
  if (!container || !youtubeVideoId.value) return
  container.innerHTML = ''

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  youtubePlayer = new window.YT.Player(container, {
    videoId: youtubeVideoId.value,
    host: 'https://www.youtube-nocookie.com',
    playerVars: {
      autoplay: 1,
      rel: 0,
      modestbranding: 1,
      origin: origin,
      enablejsapi: 1,
    },
    events: {
      onReady: () => { youtubePlayerReady.value = true },
      onError: (e) => {
        console.warn('YouTube player error:', e.data)
        youtubePlayerReady.value = false
      },
    },
  })
}

watch(videoPlaying, (playing) => {
  if (playing && youtubeVideoId.value) {
    nextTick(() => loadYoutubeApi())
  }
})

watch(() => lesson.value?.id, () => {
  videoPlaying.value = false
  youtubePlayerReady.value = false
  if (youtubePlayer && youtubePlayer.destroy) {
    youtubePlayer.destroy()
    youtubePlayer = null
  }
})

const isIframe = computed(() =>
  lesson.value?.video_provider === 'youtube' || lesson.value?.video_provider === 'vimeo'
)

function lessonIcon(l) {
  const type = l.lesson_type ?? 'video'
  if (type === 'pdf') return 'pdf'
  if (type === 'text') return 'text'
  if (type === 'quiz') return 'quiz'
  return 'video'
}

function submitQuiz() {
  const questions = lesson.value.quiz?.questions ?? []
  if (!questions.length) { quizScore.value = 0; quizSubmitted.value = true; return }
  let correct = 0
  questions.forEach((q, i) => {
    if (quizAnswers.value[i] === q.correct) correct++
  })
  quizScore.value = Math.round((correct / questions.length) * 100)
  quizSubmitted.value = true
  if (lesson.value?.id) {
    try { localStorage.setItem(`quiz-score-${lesson.value.id}`, String(quizScore.value)) } catch {}
  }

  if (quizPassed.value) {
    setCompletedLesson(lesson.value.id)
    setStatusMessage('¡Excelente! El quiz quedó aprobado y la lección se ha completado.')
    if (nextLesson.value) {
      goToLesson(nextLesson.value)
    }
    if (courseCompleted.value) {
      showCompletionModal.value = true
    }
  } else {
    setStatusMessage('No alcanzaste el 70%. Intenta nuevamente para desbloquear la siguiente lección.')
  }
}

function resetQuiz() {
  quizAnswers.value = {}
  quizSubmitted.value = false
  quizScore.value = null
}

function setCompletedLesson(id) {
  completedLessons.value = new Set(completedLessons.value)
  completedLessons.value.add(id)
  // Persist to DB
  persistLessonProgress(id)
}

async function persistLessonProgress(lessonId) {
  if (!auth.user?.id) return
  try {
    const { error } = await supabase.rpc('save_lesson_progress', {
      p_user_id: auth.user.id,
      p_lesson_id: lessonId,
      p_course_id: route.params.courseId,
    })
    if (error) console.warn('lesson_progress sync error:', error.message)
  } catch {
    // DB not available — progress saved in localStorage
  }
}

function completedInModule(mod) {
  return mod.lessons?.filter(l => completedLessons.value.has(l.id)).length ?? 0
}

function toggleModule(mod) {
  moduleOpenState.value[mod.id] = !expandedModules.value[mod.id]
}

function completeLesson() {
  if (!lesson.value) return
  if (isQuizLesson.value) {
    if (!quizPassed.value) {
      setStatusMessage('Debes aprobar el quiz antes de marcar la lección completada.')
      return
    }
  }

  if (!completedLessons.value.has(lesson.value.id)) {
    setCompletedLesson(lesson.value.id)
  }

  if (courseCompleted.value) {
    showCompletionModal.value = true
  }
}

function markComplete() {
  if (!lesson.value) return
  completeLesson()
  if (nextLesson.value && completedLessons.value.has(lesson.value.id)) {
    goToLesson(nextLesson.value)
  }
}

async function loadLesson(lessonId) {
  // Validar que lessonId sea un UUID válido antes de consultar Supabase
  if (!lessonId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lessonId)) {
    error.value = 'ID de lección inválido.'
    loading.value = false
    return
  }

  loading.value = true
  error.value = null
  quizAnswers.value = {}
  quizSubmitted.value = false
  quizScore.value = null
  videoPlaying.value = false

  try {
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('user_id', auth.user.id)
      .eq('course_id', route.params.courseId)
      .eq('status', 'active')
      .maybeSingle()

    if (!enrollment) {
      const { data: lessonCheck } = await supabase
        .from('lessons')
        .select('is_free_preview')
        .eq('id', lessonId)
        .single()

      if (!lessonCheck?.is_free_preview) {
        error.value = 'No tenés acceso a este curso.'
        loading.value = false
        return
      }
    }

    // BUG-C01: Verificar que la lección pertenezca al curso indicado en la URL
    const { data, error: err } = await supabase
      .from('lessons')
      .select(`
        id, title, description, lesson_type,
        video_provider, video_url,
        pdf_url, text_content, quiz, order_index,
        module:modules(id, title, course_id)
      `)
      .eq('id', lessonId)
      .single()

    if (err) { error.value = err.message; loading.value = false; return }
    if (data.module?.course_id !== route.params.courseId) {
      error.value = 'Esta lección no pertenece a este curso.'
      loading.value = false
      return
    }
    lesson.value = data
    auth.quizActive = data.lesson_type === 'quiz'

    // Restore quiz state for already-completed quiz lessons
    if (data.lesson_type === 'quiz' && completedLessons.value.has(data.id)) {
      quizSubmitted.value = true
      const savedScore = localStorage.getItem(`quiz-score-${data.id}`)
      quizScore.value = savedScore !== null ? parseInt(savedScore, 10) : null
    }
  } catch (err) {
    error.value = 'Error al cargar la lección.'
  } finally {
    loading.value = false
  }
}

async function loadCourse() {
  try {
    const { data, error: err } = await supabase
      .from('courses')
      .select(`
        id, title, slug, thumbnail_url,
        modules(id, title, order_index,
          lessons(id, title, lesson_type, order_index, is_free_preview)
        )
      `)
      .eq('id', route.params.courseId)
      .single()

    if (err) return
    data.modules?.sort((a, b) => a.order_index - b.order_index)
    data.modules?.forEach(m => m.lessons?.sort((a, b) => a.order_index - b.order_index))
    data.modules?.forEach(m => {
      if (!(m.id in moduleOpenState.value)) moduleOpenState.value[m.id] = true
    })
    course.value = data
  } catch (err) {
    console.error('Error loading course:', err)
  }
}

function goToLesson(l) {
  if (!lesson.value) return
  const targetIdx = allLessons.value.findIndex(item => item.id === l.id)
  if (targetIdx === -1) { error.value = 'Lección no encontrada en el curso'; return }
  if (targetIdx > currentIdx.value && !canAdvance.value && !courseCompleted.value) {
    setStatusMessage('Debes completar la lección actual antes de avanzar.')
    return
  }
  sidebarOpen.value = false
  router.push({ name: 'Lesson', params: { courseId: route.params.courseId, lessonId: l.id } })
}

function downloadCertificate() {
  showCertificateModal.value = true
}

function printCertificate() {
  window.print()
}

async function downloadCertificatePDF() {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()

  // Background
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, w, h, 'F')

  // Border
  doc.setDrawColor(79, 70, 229)
  doc.setLineWidth(1)
  doc.rect(8, 8, w - 16, h - 16)

  // Inner border
  doc.setDrawColor(79, 70, 229)
  doc.setLineWidth(0.3)
  doc.rect(12, 12, w - 24, h - 24)

  // Corner accents
  const cornerSize = 15
  doc.setLineWidth(1.5)
  // Top-left
  doc.line(12, 12, 12 + cornerSize, 12)
  doc.line(12, 12, 12, 12 + cornerSize)
  // Top-right
  doc.line(w - 12, 12, w - 12 - cornerSize, 12)
  doc.line(w - 12, 12, w - 12, 12 + cornerSize)
  // Bottom-left
  doc.line(12, h - 12, 12 + cornerSize, h - 12)
  doc.line(12, h - 12, 12, h - 12 - cornerSize)
  // Bottom-right
  doc.line(w - 12, h - 12, w - 12 - cornerSize, h - 12)
  doc.line(w - 12, h - 12, w - 12, h - 12 - cornerSize)

  // Logo placeholder (circle)
  doc.setFillColor(79, 70, 229)
  doc.circle(30, 28, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('CE', 30, 31, { align: 'center' })

  // Institution name
  doc.setTextColor(79, 70, 229)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('CoursEd Academy', 42, 26)

  doc.setTextColor(120, 120, 120)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Certificado verificado digitalmente', 42, 32)

  // Title
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.text('Certificado de Finalización', w / 2, 55, { align: 'center' })

  // Subtitle
  doc.setTextColor(100, 100, 100)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Este certificado acredita que', w / 2, 65, { align: 'center' })

  // Student name
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text(studentName.value, w / 2, 80, { align: 'center' })

  // Decorative line
  doc.setDrawColor(79, 70, 229)
  doc.setLineWidth(0.5)
  doc.line(w / 2 - 40, 85, w / 2 + 40, 85)

  // Course label
  doc.setTextColor(100, 100, 100)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Por completar el curso', w / 2, 95, { align: 'center' })

  // Course title
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  const courseTitle = course.value?.title || 'Curso'
  doc.text(courseTitle, w / 2, 105, { align: 'center', maxWidth: w - 60 })

  // Date
  doc.setTextColor(100, 100, 100)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Fecha de emisión', w / 2 - 30, 120, { align: 'center' })
  doc.setTextColor(50, 50, 50)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(completionDate.value, w / 2 - 30, 127, { align: 'center' })

  // Instructor signature
  doc.setTextColor(100, 100, 100)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Firmado por', w / 2 + 30, 120, { align: 'center' })
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(instructorName.value, w / 2 + 30, 127, { align: 'center' })
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('Instructor del curso', w / 2 + 30, 132, { align: 'center' })

  // Signature line
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.3)
  doc.line(w / 2 - 50, h - 35, w / 2 - 10, h - 35)
  doc.line(w / 2 + 10, h - 35, w / 2 + 50, h - 35)

  // Certificate ID
  doc.setTextColor(150, 150, 150)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(`ID: ${certificateId.value}`, w / 2, h - 20, { align: 'center' })

  // QR code text
  doc.text(`Verificar: ${verificationUrl.value}`, w / 2, h - 15, { align: 'center' })

  doc.save(`certificado-${certificateId.value}.pdf`)
}

function saveCompletedLessons() {
  try {
    localStorage.setItem(completedLessonsKey(), JSON.stringify(Array.from(completedLessons.value)))
  } catch {}
}

function saveExpandedModules() {
  try {
    localStorage.setItem(expandedModulesKey(), JSON.stringify(moduleOpenState.value))
  } catch {}
}

watch(completedLessons, saveCompletedLessons)
watch(moduleOpenState, saveExpandedModules, { deep: true })
watch(() => route.params.lessonId, async (id) => {
  if (id) await loadLesson(id)
})

onMounted(async () => {
  // Wait for auth to be ready before making any DB queries
  if (auth.loading) {
    await new Promise(resolve => {
      const unwatch = watch(() => auth.loading, (val) => {
        if (!val) { unwatch(); resolve() }
      })
    })
  }

  if (!auth.user) {
    loading.value = false
    return
  }

  // Load expanded modules from localStorage
  const storedExpanded = localStorage.getItem(expandedModulesKey())
  if (storedExpanded) {
    try {
      moduleOpenState.value = JSON.parse(storedExpanded) ?? {}
    } catch {}
  }

  await loadCourse()
  await loadLesson(route.params.lessonId)

  // Load completed lessons: localStorage first, DB as sync
  const storedCompleted = localStorage.getItem(completedLessonsKey())
  if (storedCompleted) {
    try {
      const ids = JSON.parse(storedCompleted)
      completedLessons.value = new Set(Array.isArray(ids) ? ids : [])
    } catch {}
  }

  // Also check quiz scores from localStorage to mark quiz lessons as completed
  if (course.value?.modules) {
    for (const mod of course.value.modules) {
      for (const l of mod.lessons ?? []) {
        if (l.lesson_type === 'quiz') {
          const savedScore = localStorage.getItem(`quiz-score-${l.id}`)
          if (savedScore !== null && parseInt(savedScore, 10) >= 70) {
            completedLessons.value.add(l.id)
          }
        }
      }
    }
  }

  // Try to load from DB and sync
  if (auth.user && course.value?.id) {
    try {
      const { data: progressRows, error: progressErr } = await supabase
        .rpc('get_completed_lessons', {
          p_user_id: auth.user.id,
          p_course_id: course.value.id,
        })

      if (!progressErr && progressRows?.length) {
        const dbIds = progressRows.map(r => r.lesson_id)
        completedLessons.value = new Set(dbIds)
        localStorage.setItem(completedLessonsKey(), JSON.stringify(dbIds))
      } else if (completedLessons.value.size > 0) {
        // DB empty but localStorage has data — sync local progress to DB
        for (const lessonId of completedLessons.value) {
          await supabase.rpc('save_lesson_progress', {
            p_user_id: auth.user.id,
            p_lesson_id: lessonId,
            p_course_id: course.value.id,
          })
        }
      }
    } catch {
      // DB not available — localStorage is already loaded
    }
  }

  // Show certificate if course is already completed (revisit)
  if (courseCompleted.value) {
    showCompletionModal.value = true
  }

  // Tab-switch detection for quiz integrity
  document.addEventListener('visibilitychange', onTabChange)
  window.addEventListener('blur', onTabBlur)
  // Keyboard shortcuts for lesson navigation
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  auth.quizActive = false
  if (quizWarningTimer) clearTimeout(quizWarningTimer)
  if (statusMessageTimer) clearTimeout(statusMessageTimer)
  document.removeEventListener('visibilitychange', onTabChange)
  window.removeEventListener('blur', onTabBlur)
  window.removeEventListener('keydown', onKeydown)
})

let quizWarningTimer = null
const quizWarningShown = ref(false)
function handleQuizCheat() {
  if (!isQuizLesson.value || quizSubmitted.value || isCurrentLessonCompleted.value) return
  if (quizWarningShown.value) return
  quizWarningShown.value = true
  setStatusMessage('⚠ Detectamos que cambiaste de pestaña. El quiz se reiniciará.')
  resetQuiz()
  if (quizWarningTimer) clearTimeout(quizWarningTimer)
  quizWarningTimer = setTimeout(() => { quizWarningShown.value = false }, 3000)
}

function onTabChange() {
  if (document.hidden) handleQuizCheat()
}

function onTabBlur() {
  if (document.hasFocus()) return
  handleQuizCheat()
}

function onKeydown(e) {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
  if (e.key === 'Escape' && showShortcutsModal.value) { showShortcutsModal.value = false; return }
  if (e.key === 'ArrowLeft' && prevLesson.value) goToLesson(prevLesson.value)
  if (e.key === 'ArrowRight' && nextLesson.value) goToLesson(nextLesson.value)
  if (e.key === 'Escape' && sidebarOpen.value) sidebarOpen.value = false
  // BUG-M05: '?' requires Shift on most layouts, so don't block on shiftKey
  if (e.key === '?' || (e.key === '/' && e.shiftKey)) { showShortcutsModal.value = true; return }
}

const showShortcutsModal = ref(false)
</script>

<template>
  <!-- BUG-M03 + BUG-L03: min-h-screen, unified surface background -->
  <div class="min-h-screen bg-surface text-slate-100 flex flex-col">
    <div class="flex flex-1 min-h-0">

      <!-- ── Sidebar ── -->
      <!-- BUG-L03: backdrop unified to --color-surface (was bg-slate-950) -->
      <aside :class="[sidebarOpen ? 'max-lg:fixed max-lg:inset-0 max-lg:z-40 max-lg:w-full' : 'max-lg:hidden', 'border-b border-slate-800 bg-surface lg:block lg:w-80 lg:border-b-0 lg:border-r lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto']">
        <div class="flex min-h-0 flex-col px-4 py-5">
          <!-- Mobile close button -->
          <button @click="sidebarOpen = false" class="mb-3 self-end rounded-lg p-2 text-slate-400 hover:text-white lg:hidden">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div class="space-y-4">
            <!-- BUG-L02: palette unified to primary (indigo) — no orange-* remains in sidebar/progress/badges -->
            <RouterLink
              v-if="course"
              :to="`/courses/${course.slug}`"
              class="inline-flex items-center gap-2 text-xs font-medium text-slate-300 transition hover:text-white"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Volver al curso
            </RouterLink>

            <div class="rounded-3xl border border-primary/20 bg-slate-900 p-4 shadow-sm shadow-black/10">
              <p class="text-sm font-semibold text-primary-light">{{ course?.title }}</p>
              <div class="mt-4 rounded-full bg-slate-800 p-1">
                <div class="h-2 rounded-full bg-primary transition-all" :style="{ width: `${progressPercent}%` }" />
              </div>
              <p class="mt-3 text-xs font-medium text-slate-400">Progreso del curso: {{ progressPercent }}%</p>
            </div>
          </div>

          <div class="mt-5 space-y-4 overflow-y-auto pr-2 pb-6">
            <div v-if="course" class="space-y-4">
              <div
                v-for="mod in course.modules"
                :key="mod.id"
                class="rounded-3xl border border-slate-800 bg-slate-900 shadow-sm shadow-black/10"
              >
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 px-4 py-4 text-left text-sm font-semibold text-white"
                  @click="toggleModule(mod)"
                >
                  <span>{{ mod.title }}</span>
                  <span class="inline-flex items-center gap-2 rounded-full bg-slate-800 border border-primary/20 px-3 py-1 text-xs font-medium text-primary-light">
                    <span>{{ completedInModule(mod) }}/{{ mod.lessons?.length ?? 0 }}</span>
                    <svg class="h-3.5 w-3.5 text-primary-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </button>

                <div v-show="expandedModules[mod.id]" class="space-y-1 border-t border-slate-800 px-2 pb-3 pt-2">
                  <button
                    v-for="l in mod.lessons"
                    :key="l.id"
                    @click="goToLesson(l)"
                    class="flex w-full items-center gap-3 rounded-3xl border px-4 py-3 text-left text-sm transition hover:bg-slate-800/80"
                    :class="l.id === lesson?.id ? 'border-primary/40 bg-primary/10 text-primary-light' : 'border-transparent text-slate-300'"
                  >
                    <span class="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-800 text-xs font-semibold text-slate-300">
                      <template v-if="lessonIcon(l) === 'video'">▶</template>
                      <template v-else-if="lessonIcon(l) === 'text'">T</template>
                      <template v-else-if="lessonIcon(l) === 'pdf'">PDF</template>
                      <template v-else>Q</template>
                    </span>
                    <span class="flex-1 line-clamp-2">{{ l.title }}</span>
                    <span v-if="completedLessons.has(l.id)" class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success text-xs font-semibold">✓</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="courseCompleted" class="mt-auto rounded-3xl border border-success/30 bg-success/5 p-5 text-center text-sm text-slate-100">
            <div class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-success/20">
              <svg class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60 60 0 0 0-.491 6.347A48.6 48.6 0 0 0 12 20.904a48.6 48.6 0 0 0 8.232-4.41 60 60 0 0 0-.491-6.347m-15.482 0a50.6 50.6 0 0 0-2.658-.813A60 60 0 0 1 12 3.493a60 60 0 0 1 10.399 5.84 51 51 0 0 0-2.658.814m-15.482 0A51 51 0 0 1 12 13.489a51 51 0 0 1 7.741-3.342" />
              </svg>
            </div>
            <p class="font-semibold text-success">Curso completado</p>
            <p class="mt-1 text-slate-400">Felicitaciones, completaste el 100% del curso.</p>
            <button @click="showCertificateModal = true" class="mt-3 w-full rounded-xl bg-success/20 px-4 py-2 text-sm font-semibold text-success transition hover:bg-success/30">
              Ver mi certificado
            </button>
          </div>
          <div v-else class="mt-auto rounded-3xl border border-slate-800 bg-slate-900 p-5 text-center text-sm text-slate-100">
            <p class="font-semibold text-white">Certificado incluido</p>
            <p class="mt-2 text-slate-400">Completa todas las lecciones para obtener tu diploma.</p>
            <div class="mt-3">
              <div class="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${progressPercent}%` }" />
              </div>
              <p class="mt-1 text-xs text-slate-500">{{ progressPercent }}% completado</p>
            </div>
          </div>
        </div>
      </aside>

      <!-- ── Main content ── -->
      <!-- BUG-L03: backdrop unified to --color-surface (was bg-slate-950) -->
      <main class="flex-1 min-h-0 overflow-y-auto bg-surface">
        <!-- Mobile sidebar toggle -->
        <button
          v-if="!sidebarOpen"
          @click="sidebarOpen = true"
          class="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg lg:hidden"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
          Menú del curso
        </button>

        <div class="mx-auto flex min-h-full max-w-6xl flex-col px-4 py-6 lg:px-8">
          <div class="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/95 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div class="space-y-2">
              <Breadcrumbs :items="breadcrumbs" />
              <p class="text-lg font-semibold text-white">{{ lesson?.title }}</p>
              <p v-if="allLessons.length" class="text-xs text-slate-500">
                Lección {{ currentIdx + 1 }} de {{ allLessons.length }}
              </p>
            </div>
            <div class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-slate-950/80 px-4 py-2 text-sm font-semibold text-white">
              <span>{{ progressPercent }}%</span>
              <span class="rounded-full bg-primary/10 px-2 py-1 text-primary-light">Progreso</span>
            </div>
            <!-- BUG-M05: Visible shortcuts button for discoverability -->
            <button
              @click="showShortcutsModal = true"
              class="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-primary/30 hover:text-white"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5h10.5M6.75 12h10.5m-10.5 4.5h10.5M3 3.75h17.25A.75.75 0 0 1 21 4.5v15a.75.75 0 0 1-.75.75H3.75A.75.75 0 0 1 3 19.5V4.5A.75.75 0 0 1 3.75 3.75Z" />
              </svg>
              Atajos
            </button>
          </div>

          <div class="space-y-6">
            <div v-if="loading" class="flex h-[calc(100vh-8rem)] items-center justify-center">
              <div class="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>

            <div v-else-if="error" class="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-4 rounded-3xl border border-error/20 bg-error/5 p-8 text-center text-error">
              <p>{{ error }}</p>
              <RouterLink to="/dashboard" class="btn-primary">Ir al dashboard</RouterLink>
            </div>

            <div v-else-if="lesson" class="space-y-6">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{{ lesson.module?.title }}</p>
                <h1 class="mt-3 text-3xl font-extrabold text-white">{{ lesson.title }}</h1>
                <p v-if="lesson.description" class="mt-3 text-slate-300">{{ lesson.description }}</p>
              </div>

              <div class="space-y-6">
                <template v-if="lesson.lesson_type === 'video' || !lesson.lesson_type">
                  <div class="aspect-video w-full overflow-hidden rounded-3xl bg-black shadow-2xl">
                    <!-- YouTube/Vimeo: click-to-play overlay -->
                    <template v-if="isIframe">
                      <div
                        v-if="!videoPlaying"
                        class="group relative flex h-full w-full cursor-pointer items-center justify-center bg-slate-900"
                        @click="videoPlaying = true"
                      >
                        <img
                          v-if="course?.thumbnail_url"
                          :src="course.thumbnail_url"
                          :alt="course.title"
                          class="absolute inset-0 h-full w-full object-cover opacity-40"
                        />
                        <div class="relative z-10 flex flex-col items-center gap-4">
                          <div class="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-600/30 transition-transform group-hover:scale-110">
                            <svg class="ml-1 h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                          <p class="text-sm text-slate-300">Click para reproducir</p>
                          <a
                            v-if="youtubeWatchUrl"
                            :href="youtubeWatchUrl"
                            target="_blank"
                            rel="noopener"
                            class="text-xs text-slate-500 underline transition hover:text-slate-300"
                            @click.stop
                          >
                            Abrir en YouTube
                          </a>
                        </div>
                      </div>
                      <iframe
                        v-else-if="embedUrl"
                        :src="embedUrl"
                        class="h-full w-full"
                        frameborder="0"
                        title="Video player"
                        referrerpolicy="strict-origin-when-cross-origin"
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowfullscreen
                      />
                      <div v-else class="flex h-full items-center justify-center text-slate-400">Sin video disponible</div>
                    </template>
                    <!-- Custom/other: native video player -->
                    <template v-else>
                      <video
                        v-if="embedUrl"
                        :src="embedUrl"
                        class="h-full w-full"
                        controls
                        controlslist="nodownload"
                      />
                      <div v-else class="flex h-full items-center justify-center text-slate-400">Sin video disponible</div>
                    </template>
                  </div>
                </template>

                  <!-- BUG-L11: ARIA dialog -->
                  <div v-if="showCertificateModal" role="dialog" aria-modal="true" aria-labelledby="certificate-modal-title" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div class="max-h-[95vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-8 text-slate-900 printable-certificate relative">
                      <!-- Decorative corner accents -->
                      <div class="absolute left-4 top-4 h-16 w-16 border-l-4 border-t-4 border-indigo-600 rounded-tl-lg"></div>
                      <div class="absolute right-4 top-4 h-16 w-16 border-r-4 border-t-4 border-indigo-600 rounded-tr-lg"></div>
                      <div class="absolute bottom-4 left-4 h-16 w-16 border-l-4 border-b-4 border-indigo-600 rounded-bl-lg"></div>
                      <div class="absolute bottom-4 right-4 h-16 w-16 border-r-4 border-b-4 border-indigo-600 rounded-br-lg"></div>

                      <div class="flex items-start justify-between">
                        <div>
                          <div class="flex items-center gap-3">
                            <svg class="h-12 w-12" viewBox="0 0 48 48" fill="none">
                              <rect width="48" height="48" rx="12" fill="#4F46E5"/>
                              <path d="M14 24l6 6 14-14" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <div>
                              <p class="text-2xl font-extrabold text-indigo-600 tracking-tight">CoursEd</p>
                              <p class="text-xs text-slate-500 uppercase tracking-widest">Academy</p>
                            </div>
                          </div>
                          <h2 id="certificate-modal-title" class="mt-6 text-3xl font-extrabold text-slate-900">Certificado de Finalización</h2>
                          <p class="mt-2 text-sm text-slate-600">Este certificado acredita que</p>
                        </div>
                        <div class="flex gap-2">
                          <button @click="printCertificate" class="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition">Imprimir</button>
                          <button @click="downloadCertificatePDF" class="rounded-md border border-indigo-300 px-4 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition">Descargar PDF</button>
                          <button @click="showCertificateModal = false" class="rounded-md border border-slate-300 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition">Cerrar</button>
                        </div>
                      </div>

                      <div class="mt-8 grid gap-8 md:grid-cols-[1fr_auto]">
                        <!-- Left: Student info -->
                        <div class="flex flex-col justify-center rounded-xl border border-slate-200 bg-slate-50 p-8">
                          <p class="text-xs font-semibold uppercase tracking-widest text-slate-500">Otorgado a</p>
                          <p class="mt-3 text-2xl font-bold text-slate-900">{{ studentName }}</p>
                          <div class="my-4 h-px bg-gradient-to-r from-indigo-500 to-transparent"></div>
                          <p class="text-xs font-semibold uppercase tracking-widest text-slate-500">Por completar el curso</p>
                          <p class="mt-2 text-lg font-semibold text-slate-800">{{ course?.title }}</p>
                          <p class="mt-4 text-xs font-semibold uppercase tracking-widest text-slate-500">Fecha de emisión</p>
                          <p class="mt-2 text-sm font-medium text-slate-700">{{ completionDate }}</p>

                          <!-- Instructor signature -->
                          <div class="mt-6 border-t border-slate-200 pt-4">
                            <p class="text-xs font-semibold uppercase tracking-widest text-slate-500">Firmado por</p>
                            <p class="mt-2 text-lg font-semibold text-slate-800 italic">{{ instructorName }}</p>
                            <p class="text-xs text-slate-500">Instructor del curso</p>
                          </div>
                        </div>

                        <!-- Right: QR + verification -->
                        <div class="flex flex-col items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-8">
                          <div class="text-center">
                            <p class="text-xs font-semibold uppercase tracking-widest text-slate-500">Institución</p>
                            <h3 class="mt-2 text-xl font-bold text-indigo-600">CoursEd Academy</h3>
                            <p class="mt-3 text-xs text-slate-500">Certificado verificado digitalmente</p>
                          </div>

                          <!-- QR Code -->
                          <div class="my-6 rounded-lg bg-white p-2 shadow-sm border border-slate-100">
                            <img
                              :src="`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verificationUrl)}`"
                              alt="QR de verificación"
                              width="120"
                              height="120"
                              loading="lazy"
                            />
                          </div>
                          <p class="text-center text-[10px] text-slate-400 max-w-[140px]">Escaneá para verificar la autenticidad</p>

                          <!-- Certificate ID -->
                          <div class="mt-4 w-full space-y-2">
                            <div class="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
                            <div class="flex items-center justify-between">
                              <p class="text-xs text-slate-400">ID del certificado</p>
                              <p class="text-xs font-mono font-semibold text-slate-600">{{ certificateId }}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                <template v-else-if="lesson.lesson_type === 'pdf'">
                  <div class="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-xl shadow-black/10">
                    <div class="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                      <div class="flex items-center gap-2 text-sm font-medium text-white">
                        <svg class="h-5 w-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                        Documento PDF
                      </div>
                      <a :href="lesson.pdf_url" target="_blank" rel="noopener" class="inline-flex items-center gap-2 rounded-2xl border border-slate-800 px-3 py-2 text-xs text-slate-300 transition hover:border-primary/30 hover:text-white">
                        <span>Descargar</span>
                      </a>
                    </div>
                    <iframe
                      v-if="lesson.pdf_url"
                      :src="`${lesson.pdf_url}#toolbar=0`"
                      class="h-[70vh] w-full"
                      title="PDF viewer"
                    />
                    <div v-else class="flex h-40 items-center justify-center text-slate-400 text-sm">PDF no disponible</div>
                  </div>
                </template>

                <template v-else-if="lesson.lesson_type === 'text'">
                  <div class="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-xl shadow-black/10">
                    <div class="flex items-center gap-2 border-b border-slate-800 px-5 py-4">
                      <svg class="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                      <span class="text-sm font-medium text-white">Contenido de la lección</span>
                    </div>
                    <div class="px-6 py-5 prose prose-invert max-w-none">
                      <div class="whitespace-pre-wrap text-slate-300 leading-relaxed">{{ lesson.text_content }}</div>
                    </div>
                  </div>
                </template>

                <template v-else-if="lesson.lesson_type === 'quiz'">
                  <div class="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/10">
                    <div class="mb-6 flex items-center gap-3">
                      <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
                        </svg>
                      </div>
                      <div>
                        <p class="font-semibold text-white">Evaluación</p>
                        <p class="text-xs text-slate-400">{{ lesson.quiz?.questions?.length ?? 0 }} preguntas</p>
                      </div>
                    </div>

                    <div v-if="quizSubmitted" class="mb-6 rounded-3xl border px-5 py-4 text-center"
                      :class="quizScore !== null && quizScore >= 70 ? 'border-success/30 bg-success/10' : quizScore !== null ? 'border-error/30 bg-error/10' : 'border-success/30 bg-success/10'"
                    >
                      <p class="text-3xl font-extrabold" :class="quizScore !== null && quizScore >= 70 ? 'text-success' : quizScore !== null ? 'text-error' : 'text-success'">
                        {{ quizScore !== null ? quizScore + '%' : 'Completado' }}
                      </p>
                      <p class="mt-1 text-sm" :class="quizScore !== null && quizScore >= 70 ? 'text-success' : quizScore !== null ? 'text-error' : 'text-success'">
                        {{ quizScore !== null ? (quizScore >= 70 ? '¡Aprobado! Buen trabajo.' : 'No aprobado. Intentalo de nuevo.') : 'Lección completada anteriormente.' }}
                      </p>
                    </div>

                    <div class="space-y-6">
                      <div v-for="(q, qi) in lesson.quiz?.questions ?? []" :key="qi" class="space-y-3">
                        <p class="font-medium text-white">{{ qi + 1 }}. {{ q.question }}</p>
                        <div class="space-y-2">
                          <label
                            v-for="(opt, oi) in q.options"
                            :key="oi"
                            class="flex cursor-pointer items-center gap-3 rounded-3xl border px-4 py-3 text-sm transition-all"
                            :class="[
                              quizSubmitted
                                ? quizAnswers[qi] === oi
                                  ? 'border-primary/40 bg-primary/10 text-primary'
                                  : 'border-slate-800 bg-slate-950 text-slate-400'
                                : quizAnswers[qi] === oi
                                  ? 'border-primary/50 bg-primary/10 text-primary'
                                  : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-primary/30'
                            ]"
                          >
                            <input
                              type="radio"
                              :name="`q${qi}`"
                              :value="oi"
                              v-model="quizAnswers[qi]"
                              :disabled="quizSubmitted"
                              class="accent-primary"
                            />
                            {{ opt }}
                          </label>
                        </div>
                      </div>
                    </div>

                    <div class="mt-6 flex flex-wrap gap-3">
                      <button
                        v-if="!quizSubmitted"
                        @click="submitQuiz"
                        :disabled="Object.keys(quizAnswers).length < (lesson.quiz?.questions?.length ?? 0)"
                        class="btn-primary px-6 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Enviar respuestas
                      </button>
                      <button
                        v-else
                        @click="resetQuiz"
                        class="rounded-2xl border border-slate-800 px-6 py-2.5 text-sm text-slate-300 transition hover:border-primary/30 hover:text-white"
                      >
                        Intentar de nuevo
                      </button>
                    </div>
                  </div>
                </template>
              </div>

              <!-- BUG-C02: statusMessage visible for user feedback -->
              <div v-if="statusMessage" role="alert" class="rounded-2xl border border-warning/30 bg-warning/10 px-5 py-3 text-sm text-warning">
                {{ statusMessage }}
              </div>

              <div class="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-sm shadow-black/10">
                <div class="grid gap-4 sm:grid-cols-3 sm:items-center">
                  <button
                    v-if="prevLesson"
                    @click="goToLesson(prevLesson)"
                    class="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-800 px-4 py-3 text-sm text-slate-300 transition hover:border-primary/30 hover:text-white"
                  >
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                    </svg>
                    Anterior
                  </button>

                  <button
                    v-if="nextLesson"
                    @click="goToLesson(nextLesson)"
                    :disabled="!canAdvance && !courseCompleted"
                    :class="['inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm transition', !canAdvance && !courseCompleted ? 'cursor-not-allowed opacity-50 border border-slate-800 bg-slate-900 text-slate-500' : 'btn-primary']"
                  >
                    Siguiente
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </button>

                  <button
                    @click="markComplete"
                    :disabled="!canCompleteCurrentLesson && !isCurrentLessonCompleted"
                    :class="['rounded-2xl px-6 py-3 text-sm transition', isCurrentLessonCompleted ? 'border border-slate-800 bg-slate-900 text-slate-400 cursor-not-allowed' : canCompleteCurrentLesson ? 'btn-primary' : 'cursor-not-allowed opacity-50 border border-slate-800 bg-slate-900 text-slate-500']"
                  >
                    {{ isCurrentLessonCompleted ? 'Lección completada ✔' : 'Marcar completado' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <Footer />

    <!-- BUG-L11: ARIA dialog -->
    <div v-if="showCompletionModal" role="dialog" aria-modal="true" aria-labelledby="completion-modal-title" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4">
      <div class="w-full max-w-3xl overflow-hidden rounded-3xl border border-primary/20 bg-slate-950 p-6 shadow-2xl">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.24em] text-primary-light">Curso completado</p>
            <h2 id="completion-modal-title" class="mt-3 text-3xl font-semibold text-white">¡Felicitaciones!</h2>
            <p class="mt-2 text-slate-400">Has completado el curso <span class="font-semibold text-primary-light">{{ course?.title }}</span>.</p>
          </div>
          <button @click="showCompletionModal = false" class="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800">Cerrar</button>
        </div>

        <div class="mt-6 grid gap-4 sm:grid-cols-2">
          <div class="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <p class="text-xs uppercase tracking-[0.2em] text-slate-500">Nombre</p>
            <p class="mt-3 text-lg font-semibold text-white">{{ studentName }}</p>
          </div>
          <div class="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <p class="text-xs uppercase tracking-[0.2em] text-slate-500">Fecha</p>
            <p class="mt-3 text-lg font-semibold text-white">{{ completionDate }}</p>
          </div>
        </div>

        <div class="mt-6 flex flex-wrap gap-3">
          <button @click="printCertificate" class="btn-primary rounded-2xl px-6 py-3">Imprimir certificado</button>
          <button @click="downloadCertificatePDF" class="rounded-2xl border border-primary/30 bg-primary/10 px-6 py-3 text-primary-light transition hover:bg-primary/20">Descargar PDF</button>
        </div>
      </div>
    </div>

    <!-- Shortcuts Modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <!-- BUG-L11: ARIA dialog -->
        <div v-if="showShortcutsModal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-modal-title" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" @click.self="showShortcutsModal = false">
          <div class="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div class="flex items-center justify-between">
              <h3 id="shortcuts-modal-title" class="text-lg font-bold text-white">Atajos de teclado</h3>
              <button @click="showShortcutsModal = false" class="text-slate-500 hover:text-white">
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="mt-4 space-y-3">
              <div class="flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-2.5">
                <span class="text-sm text-slate-300">Lección anterior</span>
                <kbd class="rounded bg-slate-700 px-2 py-1 text-xs font-mono text-slate-200">←</kbd>
              </div>
              <div class="flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-2.5">
                <span class="text-sm text-slate-300">Lección siguiente</span>
                <kbd class="rounded bg-slate-700 px-2 py-1 text-xs font-mono text-slate-200">→</kbd>
              </div>
              <div class="flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-2.5">
                <span class="text-sm text-slate-300">Cerrar sidebar</span>
                <kbd class="rounded bg-slate-700 px-2 py-1 text-xs font-mono text-slate-200">Esc</kbd>
              </div>
              <div class="flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-2.5">
                <span class="text-sm text-slate-300">Mostrar esta lista</span>
                <kbd class="rounded bg-slate-700 px-2 py-1 text-xs font-mono text-slate-200">?</kbd>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style>
/* Print styles: show only the printable certificate content when printing */
@media print {
  /* Hide everything */
  body * { visibility: hidden !important; }
  /* Show the printable certificate and its children */
  .printable-certificate, .printable-certificate * { visibility: visible !important; }
  /* Ensure printable certificate fills the page */
  .printable-certificate { position: absolute !important; left: 0; top: 0; width: 100% !important; }
  /* Remove shadows and rounded corners for print */
  .printable-certificate { box-shadow: none !important; border-radius: 0 !important; }
}
</style>
