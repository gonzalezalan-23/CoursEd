<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import { supabase } from '@/services/supabase'
import Breadcrumbs from '@/components/Breadcrumbs.vue'

const route  = useRoute()
const router = useRouter()
const auth   = useAuthStore()
const { confirm } = useConfirm()
const toast  = useToast()

const course       = ref(null)
const modules      = ref([])
const loading      = ref(true)
const saving       = ref(false)
const error        = ref(null)        // BUG-C05: load error only (replaces editor)
const opError      = ref(null)        // BUG-C05: operation error (inline banner, doesn't unmount editor)

// Inline editing state
const editingMod    = ref(null)  // { id, title, description } | null
const editingLesson = ref(null)  // { id, title, description, video_provider, video_url, duration_seconds, is_free_preview, module_id } | null
const addingModForm = ref(false)
const newMod        = ref({ title: '', description: '' })
const addingLessonForMod = ref(null) // module_id
const newLesson     = ref({ title: '', description: '', lesson_type: 'video', video_provider: 'youtube', video_url: '', pdf_url: '', text_content: '', quiz: null, is_free_preview: false, duration_minutes: 0 })
const breadcrumbs   = computed(() => {
  const items = [{ label: 'Inicio', to: '/' }, { label: 'Dashboard', to: '/dashboard' }]
  if (course.value?.title) items.push({ label: course.value.title, to: `/courses/${course.value.slug}` })
  items.push({ label: 'Contenido' })
  return items
})

// ── Bulk import state ──
const bulkImportMod = ref(null) // module_id activo en modo carga rápida
const bulkRows = ref([])
const bulkSaving = ref(false)

function openBulkImport(mod) {
  bulkImportMod.value = mod.id
  bulkRows.value = [emptyBulkRow()]
  addingLessonForMod.value = null
  editingLesson.value = null
}

function emptyBulkRow() {
  return { title: '', video_url: '', duration_minutes: '', is_free_preview: false }
}

function addBulkRow() {
  bulkRows.value.push(emptyBulkRow())
}

function removeBulkRow(idx) {
  bulkRows.value.splice(idx, 1)
  if (bulkRows.value.length === 0) bulkRows.value.push(emptyBulkRow())
}

async function saveBulkLessons(mod) {
  const valid = bulkRows.value.filter(r => r.title.trim() && r.video_url.trim())
  if (!valid.length) return

  bulkSaving.value = true
  try {
    const baseOrder = (mod.lessons?.length ?? 0) + 1
    const inserts = valid.map((r, i) => ({
      module_id: mod.id,
      course_id: course.value.id,
      order_index: baseOrder + i,
      title: r.title.trim(),
      video_url: r.video_url.trim(),
      video_provider: detectProvider(r.video_url.trim()),
      lesson_type: 'video',
      is_free_preview: r.is_free_preview,
      duration_seconds: Math.max(0, Math.round((Number(r.duration_minutes) || 0) * 60)),
      description: '',
    }))

    const { data, error: err } = await supabase.from('lessons').insert(inserts).select()
    if (err) { opError.value = err.message; toast.error('Error al guardar las lecciones.'); return }

    mod.lessons = [...(mod.lessons ?? []), ...data]
    bulkImportMod.value = null
    bulkRows.value = []
    toast.success?.(`${data.length} lección${data.length !== 1 ? 'es' : ''} agregada${data.length !== 1 ? 's' : ''}.`)
  } catch (err) {
    opError.value = 'Error al guardar las lecciones.'
    toast.error('Error al guardar las lecciones.')
  } finally {
    bulkSaving.value = false
  }
}

function detectProvider(url) {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube'
  if (/vimeo\.com/.test(url)) return 'vimeo'
  return 'custom'
}

// ── Auto-save to localStorage ──
const draftKey = (modId) => `course-${route.params.slug}-draft-${modId}`

function saveLessonDraft() {
  if (addingLessonForMod.value && newLesson.value.title.trim()) {
    localStorage.setItem(draftKey(addingLessonForMod.value), JSON.stringify(newLesson.value))
  }
}

function loadLessonDraft(modId) {
  const saved = localStorage.getItem(draftKey(modId))
  if (saved) {
    try {
      newLesson.value = JSON.parse(saved)
    } catch {}
  }
}

function clearLessonDraft(modId) {
  localStorage.removeItem(draftKey(modId))
}

// Watch for lesson form changes and save to localStorage
watch(newLesson, saveLessonDraft, { deep: true })

// ── Load ──
async function load() {
  loading.value = true
  try {
    const { data, error: err } = await supabase
      .from('courses')
      .select(`
        id, title, slug, instructor_id,
        modules(
          id, title, description, order_index,
          lessons(id, title, description, lesson_type, video_provider, video_url, pdf_url, text_content, quiz, duration_seconds, is_free_preview, order_index)
        )
      `)
      .eq('slug', route.params.slug)
      .single()

    if (err || !data) { error.value = 'Curso no encontrado.'; loading.value = false; return }
    if (data.instructor_id !== auth.user?.id) { router.push('/dashboard'); return }

    data.modules?.sort((a, b) => a.order_index - b.order_index)
    data.modules?.forEach(m => m.lessons?.sort((a, b) => a.order_index - b.order_index))
    course.value = data
    modules.value = data.modules ?? []
  } catch (err) {
    error.value = 'Error al cargar el curso.'
  } finally {
    loading.value = false
  }
}

// ── Modules ──
async function addModule() {
  if (!newMod.value.title.trim()) return
  saving.value = true
  try {
    const { data, error: err } = await supabase
      .from('modules')
      .insert({ course_id: course.value.id, title: newMod.value.title, description: newMod.value.description, order_index: Math.max(...modules.value.map(m => m.order_index), 0) + 1 })
      .select()
      .single()
    if (!err) { modules.value.push({ ...data, lessons: [] }); newMod.value = { title: '', description: '' }; addingModForm.value = false }
    else { opError.value = err.message; toast.error('Error al crear el módulo.') }
  } catch (err) {
    opError.value = 'Error al crear el módulo.'
    toast.error('Error al crear el módulo.')
  }
  saving.value = false
}

async function saveModule(mod) {
  saving.value = true
  try {
    const { error: err } = await supabase.from('modules').update({ title: editingMod.value.title, description: editingMod.value.description }).eq('id', mod.id)
    if (!err) { mod.title = editingMod.value.title; mod.description = editingMod.value.description; editingMod.value = null }
    else { opError.value = err.message; toast.error('Error al guardar el módulo.') }
  } catch (err) {
    opError.value = 'Error al guardar el módulo.'
    toast.error('Error al guardar el módulo.')
  }
  saving.value = false
}

async function deleteModule(modId) {
  const confirmed = await confirm({
    title: 'Eliminar módulo',
    message: '¿Eliminar este módulo y todas sus lecciones?',
    confirmText: 'Eliminar',
    variant: 'danger',
  })
  if (!confirmed) return
  try {
    const { error: err } = await supabase.from('modules').delete().eq('id', modId)
    if (!err) modules.value = modules.value.filter(m => m.id !== modId)
    else { opError.value = err.message; toast.error('Error al eliminar el módulo.') }
  } catch (err) {
    opError.value = 'Error al eliminar el módulo.'
    toast.error('Error al eliminar el módulo.')
  }
}

async function moveModule(idx, dir) {
  const target = idx + dir
  if (target < 0 || target >= modules.value.length) return
  const a = modules.value[idx], b = modules.value[target]
  ;[a.order_index, b.order_index] = [b.order_index, a.order_index]
  try {
    await Promise.all([
      supabase.from('modules').update({ order_index: a.order_index }).eq('id', a.id),
      supabase.from('modules').update({ order_index: b.order_index }).eq('id', b.id),
    ])
    modules.value.splice(idx, 1)
    modules.value.splice(target, 0, a)
  } catch (err) {
    ;[a.order_index, b.order_index] = [b.order_index, a.order_index]
    opError.value = 'Error al reordenar módulos.'
    toast.error('Error al reordenar módulos.')
  }
}

// ── Lessons ──
function lessonPayload(form) {
  const base = {
    title:           form.title,
    description:     form.description,
    lesson_type:     form.lesson_type,
    is_free_preview: form.is_free_preview,
    // BUG-M02: Convert minutes to duration_seconds
    duration_seconds: Math.max(0, Math.round((Number(form.duration_minutes) || 0) * 60)),
  }
  if (form.lesson_type === 'video') {
    base.video_provider = form.video_provider
    base.video_url      = form.video_url
    base.pdf_url        = null
    base.text_content   = null
    base.quiz           = null
  } else if (form.lesson_type === 'pdf') {
    base.pdf_url        = form.pdf_url
    base.video_url      = ''
    base.text_content   = null
    base.quiz           = null
  } else if (form.lesson_type === 'text') {
    base.text_content   = form.text_content
    base.video_url      = ''
    base.pdf_url        = null
    base.quiz           = null
  } else if (form.lesson_type === 'quiz') {
    base.quiz           = form.quiz
    base.video_url      = ''
    base.pdf_url        = null
    base.text_content   = null
  }
  return base
}

function isLessonValid(form) {
  if (!form.title.trim()) return false
  if (form.lesson_type === 'video' && !form.video_url.trim()) return false
  if (form.lesson_type === 'pdf'   && !form.pdf_url?.trim()) return false
  if (form.lesson_type === 'text'  && !form.text_content?.trim()) return false
  return true
}

async function addLesson(mod) {
  if (!isLessonValid(newLesson.value)) return
  saving.value = true
  try {
    const { data, error: err } = await supabase
      .from('lessons')
      .insert({
        module_id:   mod.id,
        course_id:   course.value.id,
        order_index: (mod.lessons?.length ?? 0) + 1,
        ...lessonPayload(newLesson.value),
      })
      .select()
      .single()
    if (!err) {
      mod.lessons = [...(mod.lessons ?? []), data]
      clearLessonDraft(mod.id)
      newLesson.value = { title: '', description: '', lesson_type: 'video', video_provider: 'youtube', video_url: '', pdf_url: '', text_content: '', quiz: null, is_free_preview: false, duration_minutes: 0 }
      addingLessonForMod.value = null
    } else { opError.value = err.message; toast.error('Error al crear la lección.') }
  } catch (err) {
    opError.value = 'Error al crear la lección.'
    toast.error('Error al crear la lección.')
  }
  saving.value = false
}

async function saveLesson(mod) {
  saving.value = true
  try {
    const { error: err } = await supabase.from('lessons').update(
      lessonPayload(editingLesson.value)
    ).eq('id', editingLesson.value.id)
    if (!err) {
      const lesson = mod.lessons.find(l => l.id === editingLesson.value.id)
      if (!lesson) { opError.value = 'Lección no encontrada'; return }
      Object.assign(lesson, editingLesson.value)
      editingLesson.value = null
    } else { opError.value = err.message; toast.error('Error al guardar la lección.') }
  } catch (err) {
    opError.value = 'Error al guardar la lección.'
    toast.error('Error al guardar la lección.')
  }
  saving.value = false
}

async function deleteLesson(mod, lessonId) {
  const confirmed = await confirm({
    title: 'Eliminar lección',
    message: '¿Eliminar esta lección?',
    confirmText: 'Eliminar',
    variant: 'danger',
  })
  if (!confirmed) return
  try {
    const { error: err } = await supabase.from('lessons').delete().eq('id', lessonId)
    if (!err) mod.lessons = mod.lessons.filter(l => l.id !== lessonId)
    else { opError.value = err.message; toast.error('Error al eliminar la lección.') }
  } catch (err) {
    opError.value = 'Error al eliminar la lección.'
    toast.error('Error al eliminar la lección.')
  }
}

async function moveLesson(mod, idx, dir) {
  const target = idx + dir
  if (target < 0 || target >= mod.lessons.length) return
  const a = mod.lessons[idx], b = mod.lessons[target]
  ;[a.order_index, b.order_index] = [b.order_index, a.order_index]
  try {
    await Promise.all([
      supabase.from('lessons').update({ order_index: a.order_index }).eq('id', a.id),
      supabase.from('lessons').update({ order_index: b.order_index }).eq('id', b.id),
    ])
    mod.lessons.splice(idx, 1)
    mod.lessons.splice(target, 0, a)
  } catch (err) {
    ;[a.order_index, b.order_index] = [b.order_index, a.order_index]
    opError.value = 'Error al reordenar lecciones.'
    toast.error('Error al reordenar lecciones.')
  }
}

function startEditLesson(lesson) {
  editingLesson.value = {
    ...lesson,
    lesson_type:  lesson.lesson_type ?? 'video',
    pdf_url:      lesson.pdf_url ?? '',
    text_content: lesson.text_content ?? '',
    quiz:         lesson.quiz ? JSON.parse(JSON.stringify(lesson.quiz)) : { questions: [] },
    // BUG-M02: Populate duration_minutes from duration_seconds
    duration_minutes: lesson.duration_seconds ? Math.round(lesson.duration_seconds / 60) : 0,
  }
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen px-6 py-12">
    <div class="mx-auto max-w-3xl">

      <!-- Header -->
      <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Breadcrumbs :items="breadcrumbs" />
          <h1 class="text-2xl font-extrabold text-text-primary">Contenido del curso</h1>
          <p v-if="course" class="mt-1 text-sm text-text-muted">{{ course.title }}</p>
        </div>
        <RouterLink v-if="course" :to="`/courses/${course.slug}/edit`" class="rounded-lg border border-surface-lighter px-4 py-2 text-sm text-text-secondary transition hover:border-primary/30 hover:text-text-primary">
          Editar info del curso
        </RouterLink>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-20">
        <div class="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>

      <div v-else-if="error" class="glass-card p-8 text-center text-error">{{ error }}</div>

      <div v-else class="space-y-4">

        <!-- Module list -->
        <div v-for="(mod, modIdx) in modules" :key="mod.id" class="glass-card overflow-hidden">

          <!-- Module header -->
          <div class="flex items-center gap-3 border-b border-surface-lighter bg-surface-light/60 px-5 py-3">
            <div class="flex flex-col gap-0.5">
              <button @click="moveModule(modIdx, -1)" :disabled="modIdx === 0" class="text-text-muted hover:text-text-primary disabled:opacity-20">
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>
              </button>
              <button @click="moveModule(modIdx, 1)" :disabled="modIdx === modules.length - 1" class="text-text-muted hover:text-text-primary disabled:opacity-20">
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
              </button>
            </div>

            <div class="flex-1 min-w-0">
              <template v-if="editingMod?.id === mod.id">
                <input v-model="editingMod.title" class="w-full rounded border border-primary/40 bg-surface px-2 py-1 text-sm text-text-primary outline-none" @keyup.enter="saveModule(mod)" @keyup.escape="editingMod = null" />
              </template>
              <p v-else class="truncate font-semibold text-text-primary">{{ mod.title }}</p>
              <p class="text-xs text-text-muted">{{ mod.lessons?.length ?? 0 }} lecciones</p>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <template v-if="editingMod?.id === mod.id">
                <button @click="saveModule(mod)" :disabled="saving" class="rounded bg-primary px-3 py-1.5 text-xs text-white hover:brightness-110 disabled:opacity-50 sm:py-1">Guardar</button>
                <button @click="editingMod = null" class="rounded border border-surface-lighter px-3 py-1.5 text-xs text-text-muted hover:text-text-primary sm:py-1">Cancelar</button>
              </template>
              <template v-else>
                <button @click="editingMod = { id: mod.id, title: mod.title, description: mod.description }" class="rounded border border-surface-lighter px-3 py-1.5 text-xs text-text-secondary hover:border-primary/30 hover:text-text-primary sm:py-1">Editar</button>
                <button @click="openBulkImport(mod)" class="rounded border border-indigo-500/30 px-3 py-1.5 text-xs text-indigo-400 hover:bg-indigo-500/10 sm:py-1">Carga rápida</button>
                <button @click="deleteModule(mod.id)" class="rounded border border-error/30 px-3 py-1.5 text-xs text-error hover:bg-error/10 sm:py-1">Eliminar</button>
              </template>
            </div>
          </div>

          <!-- Lessons -->
          <div class="divide-y divide-surface-lighter/50">
            <div v-for="(lesson, lessonIdx) in mod.lessons" :key="lesson.id">

              <!-- Lesson view / edit -->
              <div v-if="editingLesson?.id === lesson.id" class="space-y-3 p-4">
                <input v-model="editingLesson.title" placeholder="Título" class="w-full rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50" />
                <textarea v-model="editingLesson.description" placeholder="Descripción (opcional)" rows="2" class="w-full resize-none rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50" />
                <select v-model="editingLesson.lesson_type" class="w-full rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50">
                  <option value="video">🎬 Video</option>
                  <option value="text">📝 Texto</option>
                  <option value="pdf">📄 PDF</option>
                  <option value="quiz">❓ Quiz</option>
                </select>
                <template v-if="editingLesson.lesson_type === 'video'">
                  <select v-model="editingLesson.video_provider" class="w-full rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50">
                    <option value="youtube">YouTube</option>
                    <option value="vimeo">Vimeo</option>
                    <option value="custom">Custom</option>
                  </select>
                  <input v-model="editingLesson.video_url" placeholder="URL del video" class="w-full rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50" />
                </template>
                <template v-else-if="editingLesson.lesson_type === 'pdf'">
                  <input v-model="editingLesson.pdf_url" placeholder="URL del PDF" class="w-full rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50" />
                </template>
                <template v-else-if="editingLesson.lesson_type === 'text'">
                  <textarea v-model="editingLesson.text_content" placeholder="Escribí o pegá el contenido de la lección aquí..." rows="10" class="w-full resize-y rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50 font-mono"></textarea>
                  <p class="text-xs text-text-muted">Podés pegar texto plano, listas, código, etc.</p>
                </template>
                <template v-else-if="editingLesson.lesson_type === 'quiz'">
                  <div class="space-y-3 rounded-lg border border-surface-lighter bg-surface/60 p-3">
                    <p class="text-xs font-semibold text-text-muted">Preguntas del quiz</p>
                    <div v-for="(q, qi) in editingLesson.quiz.questions" :key="qi" class="space-y-2 rounded-lg border border-surface-lighter p-3">
                      <div class="flex items-center gap-2">
                        <input v-model="q.question" :placeholder="`Pregunta ${qi + 1}`" class="flex-1 rounded border border-surface-lighter bg-surface px-2 py-1.5 text-xs text-text-primary outline-none focus:border-primary/50" />
                        <button @click="editingLesson.quiz.questions.splice(qi, 1)" class="text-error hover:opacity-70 text-xs">✕</button>
                      </div>
                      <div v-for="(opt, oi) in q.options" :key="oi" class="flex items-center gap-2">
                        <input type="radio" :name="`eq${qi}`" :value="oi" v-model="q.correct" class="accent-primary shrink-0" />
                        <input v-model="q.options[oi]" :placeholder="`Opción ${oi + 1}`" class="flex-1 rounded border border-surface-lighter bg-surface px-2 py-1.5 text-xs text-text-primary outline-none focus:border-primary/50" />
                      </div>
                    </div>
                    <button @click="editingLesson.quiz.questions.push({ question: '', options: ['', '', '', ''], correct: 0 })" class="text-xs text-primary-light hover:underline">+ Agregar pregunta</button>
                  </div>
                </template>
                <label class="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
                  <input v-model="editingLesson.is_free_preview" type="checkbox" class="accent-primary" />
                  Vista previa gratuita
                </label>
                <!-- BUG-M02: Duration input -->
                <div>
                  <label class="mb-1 block text-xs font-medium text-text-muted">Duración (minutos)</label>
                  <input v-model.number="editingLesson.duration_minutes" type="number" min="0" step="1" placeholder="0" class="w-full rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50" />
                </div>
                <div class="flex gap-2">
                  <button @click="saveLesson(mod)" :disabled="saving" class="rounded bg-primary px-4 py-1.5 text-xs text-white hover:brightness-110 disabled:opacity-50">Guardar</button>
                  <button @click="editingLesson = null" class="rounded border border-surface-lighter px-4 py-1.5 text-xs text-text-muted hover:text-text-primary">Cancelar</button>
                </div>
              </div>

              <div v-else class="flex items-center gap-3 px-5 py-3">
                <div class="flex flex-col gap-0.5">
                  <button @click="moveLesson(mod, lessonIdx, -1)" :disabled="lessonIdx === 0" class="text-text-muted hover:text-text-primary disabled:opacity-20">
                    <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>
                  </button>
                  <button @click="moveLesson(mod, lessonIdx, 1)" :disabled="lessonIdx === mod.lessons.length - 1" class="text-text-muted hover:text-text-primary disabled:opacity-20">
                    <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                  </button>
                </div>

                <svg class="h-4 w-4 shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>

                <div class="flex-1 min-w-0">
                  <p class="truncate text-sm text-text-primary">{{ lesson.title }}</p>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-xs text-text-muted capitalize">{{ lesson.lesson_type ?? 'video' }}</span>
                    <span v-if="lesson.is_free_preview" class="rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] text-success">Preview</span>
                  </div>
                </div>

                <div class="flex shrink-0 items-center gap-2">
                  <button @click="startEditLesson(lesson)" class="rounded border border-surface-lighter px-3 py-1.5 text-xs text-text-secondary hover:border-primary/30 hover:text-text-primary sm:py-1">Editar</button>
                  <button @click="deleteLesson(mod, lesson.id)" class="rounded border border-error/30 px-3 py-1.5 text-xs text-error hover:bg-error/10 sm:py-1">Eliminar</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Bulk import panel -->
          <div v-if="bulkImportMod === mod.id" class="border-t border-surface-lighter bg-surface/40 p-4 space-y-4">
            <div class="flex items-center justify-between">
              <p class="text-xs font-semibold uppercase tracking-wider text-indigo-400">Carga rápida de lecciones</p>
              <button @click="bulkImportMod = null" class="text-xs text-text-muted hover:text-text-primary">✕ Cancelar</button>
            </div>

            <p class="text-xs text-text-muted">Completá título y URL de cada lección. El proveedor (YouTube/Vimeo/Custom) se detecta automáticamente.</p>

            <!-- Table header -->
            <div class="hidden grid-cols-[1fr_1.5fr_5rem_4rem_2rem] gap-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted sm:grid">
              <span>Título *</span>
              <span>URL del video *</span>
              <span>Min.</span>
              <span>Preview</span>
              <span></span>
            </div>

            <!-- Rows -->
            <div class="space-y-2">
              <div
                v-for="(row, idx) in bulkRows"
                :key="idx"
                class="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.5fr_5rem_4rem_2rem] sm:items-center"
              >
                <input
                  v-model="row.title"
                  placeholder="Título *"
                  class="rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50"
                />
                <input
                  v-model="row.video_url"
                  placeholder="https://youtube.com/..."
                  class="rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50"
                />
                <input
                  v-model="row.duration_minutes"
                  type="number"
                  min="0"
                  placeholder="0"
                  class="rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50"
                />
                <label class="flex items-center justify-center gap-1.5 text-xs text-text-secondary">
                  <input v-model="row.is_free_preview" type="checkbox" class="accent-primary" />
                  <span class="sm:hidden">Vista previa</span>
                </label>
                <button
                  @click="removeBulkRow(idx)"
                  class="flex items-center justify-center text-error/60 hover:text-error transition"
                  aria-label="Eliminar fila"
                >
                  <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <button
                @click="addBulkRow"
                class="flex items-center gap-1.5 text-xs text-text-muted hover:text-primary-light transition"
              >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Agregar fila
              </button>
              <button
                @click="saveBulkLessons(mod)"
                :disabled="bulkSaving || !bulkRows.some(r => r.title.trim() && r.video_url.trim())"
                class="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {{ bulkSaving ? 'Guardando...' : `Guardar ${bulkRows.filter(r => r.title.trim() && r.video_url.trim()).length} lección${bulkRows.filter(r => r.title.trim() && r.video_url.trim()).length !== 1 ? 'es' : ''}` }}
              </button>
            </div>
          </div>

          <!-- Add lesson form -->
          <div v-if="addingLessonForMod === mod.id" class="space-y-3 border-t border-surface-lighter bg-surface/40 p-4">
            <p class="text-xs font-semibold uppercase tracking-wider text-text-muted">Nueva lección</p>
            <input v-model="newLesson.title" placeholder="Título de la lección *" class="w-full rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50" />
            <textarea v-model="newLesson.description" placeholder="Descripción (opcional)" rows="2" class="w-full resize-none rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50" />
            <select v-model="newLesson.lesson_type" class="w-full rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50">
              <option value="video">🎬 Video</option>
              <option value="text">📝 Texto</option>
              <option value="pdf">📄 PDF</option>
              <option value="quiz">❓ Quiz</option>
            </select>
            <template v-if="newLesson.lesson_type === 'video'">
              <select v-model="newLesson.video_provider" class="w-full rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50">
                <option value="youtube">YouTube</option>
                <option value="vimeo">Vimeo</option>
                <option value="custom">Custom</option>
              </select>
              <input v-model="newLesson.video_url" placeholder="URL del video *" class="w-full rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50" />
            </template>
            <template v-else-if="newLesson.lesson_type === 'pdf'">
              <input v-model="newLesson.pdf_url" placeholder="URL del PDF *" class="w-full rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50" />
            </template>
            <template v-else-if="newLesson.lesson_type === 'text'">
              <textarea v-model="newLesson.text_content" placeholder="Escribí o pegá el contenido de la lección aquí..." rows="10" class="w-full resize-y rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50 font-mono"></textarea>
              <p class="text-xs text-text-muted">Podés pegar texto plano, listas, código, etc.</p>
            </template>
            <template v-else-if="newLesson.lesson_type === 'quiz'">
              <div class="space-y-3 rounded-lg border border-surface-lighter bg-surface/60 p-3">
                <p class="text-xs font-semibold text-text-muted">Preguntas del quiz</p>
                <div v-for="(q, qi) in (newLesson.quiz?.questions ?? [])" :key="qi" class="space-y-2 rounded-lg border border-surface-lighter p-3">
                  <div class="flex items-center gap-2">
                    <input v-model="q.question" :placeholder="`Pregunta ${qi + 1}`" class="flex-1 rounded border border-surface-lighter bg-surface px-2 py-1.5 text-xs text-text-primary outline-none focus:border-primary/50" />
                    <button @click="newLesson.quiz.questions.splice(qi, 1)" class="text-error hover:opacity-70 text-xs">✕</button>
                  </div>
                  <div v-for="(opt, oi) in q.options" :key="oi" class="flex items-center gap-2">
                    <input type="radio" :name="`nq${qi}`" :value="oi" v-model="q.correct" class="accent-primary shrink-0" />
                    <input v-model="q.options[oi]" :placeholder="`Opción ${oi + 1}`" class="flex-1 rounded border border-surface-lighter bg-surface px-2 py-1.5 text-xs text-text-primary outline-none focus:border-primary/50" />
                  </div>
                </div>
                <button @click="newLesson.quiz = newLesson.quiz ?? { questions: [] }; newLesson.quiz.questions.push({ question: '', options: ['', '', '', ''], correct: 0 })" class="text-xs text-primary-light hover:underline">+ Agregar pregunta</button>
              </div>
            </template>
            <label class="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
              <input v-model="newLesson.is_free_preview" type="checkbox" class="accent-primary" />
              Vista previa gratuita
            </label>
            <!-- BUG-M02: Duration input -->
            <div>
              <label class="mb-1 block text-xs font-medium text-text-muted">Duración (minutos)</label>
              <input v-model.number="newLesson.duration_minutes" type="number" min="0" step="1" placeholder="0" class="w-full rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50" />
            </div>
            <div class="flex gap-2">
              <button @click="addLesson(mod)" :disabled="saving" class="btn-primary px-4 py-1.5 text-xs disabled:opacity-50">Agregar lección</button>
              <button @click="addingLessonForMod = null" class="rounded border border-surface-lighter px-4 py-1.5 text-xs text-text-muted hover:text-text-primary">Cancelar</button>
            </div>
          </div>

          <!-- Add lesson button -->
          <div v-else class="border-t border-surface-lighter/50 px-5 py-3">
            <button @click="addingLessonForMod = mod.id; editingLesson = null; loadLessonDraft(mod.id)" class="flex items-center gap-1.5 text-xs text-text-muted hover:text-primary-light transition-colors">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Agregar lección
            </button>
          </div>
        </div>

        <!-- Add module form -->
        <div v-if="addingModForm" class="glass-card space-y-3 p-5">
          <p class="text-sm font-semibold text-text-primary">Nuevo módulo</p>
          <input v-model="newMod.title" placeholder="Título del módulo *" class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary/50" @keyup.enter="addModule" />
          <textarea v-model="newMod.description" placeholder="Descripción (opcional)" rows="2" class="w-full resize-none rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary/50" />
          <div class="flex gap-2">
            <button @click="addModule" :disabled="saving" class="btn-primary px-5 py-2 text-sm disabled:opacity-50">Crear módulo</button>
            <button @click="addingModForm = false" class="rounded-lg border border-surface-lighter px-5 py-2 text-sm text-text-muted hover:text-text-primary">Cancelar</button>
          </div>
        </div>

        <!-- Add module button -->
        <button
          v-else
          @click="addingModForm = true; editingMod = null"
          class="glass-card flex w-full items-center justify-center gap-2 py-4 text-sm text-text-muted transition hover:border-primary/30 hover:text-primary-light"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Agregar módulo
        </button>

        <!-- BUG-C05: inline operation error — does NOT unmount the editor -->
        <div v-if="opError" class="rounded-lg border border-error/20 bg-error/10 px-4 py-3 text-sm text-error flex items-center justify-between">
          <span>{{ opError }}</span>
          <button @click="opError = null" class="ml-3 shrink-0 text-error/70 hover:text-error">✕</button>
        </div>

      </div>
    </div>
  </div>
</template>
