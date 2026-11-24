<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute, RouterLink, onBeforeRouteLeave } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCourseStore } from '@/stores/courses'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { supabase } from '@/services/supabase'

const router      = useRouter()
const route       = useRoute()
const auth        = useAuthStore()
const courseStore = useCourseStore()
const toast       = useToast()
const { confirm } = useConfirm()
const hasUnsavedChanges = ref(false)
const originalForm = ref(null)

onBeforeRouteLeave(async (to, from, next) => {
  if (hasUnsavedChanges.value) {
    const answer = await confirm({
      title: 'Cambios sin guardar',
      message: 'Tenés cambios sin guardar. ¿Seguro que querés salir?',
      confirmText: 'Salir',
      cancelText: 'Quedarme',
      variant: 'warning',
    })
    if (!answer) return next(false)
  }
  next()
})

const isEdit  = computed(() => !!route.params.slug)
const loading = ref(false)
const error   = ref(null)
const categories = ref([])

// Auto-save state
const saveStatus = ref('idle') // 'idle' | 'saving' | 'saved' | 'error'
const lastSaved  = ref(null)
let debounceTimer = null
let isCreating = false
let retryCount = 0
const MAX_RETRIES = 3
let beforeUnloadHandler = null

const form = ref({
  title:          '',
  description:    '',
  price:          0,
  currency:       'ARS',
  thumbnail_url:  '',
  demo_video_url: '',
  level:          'beginner',
  category_id:    null,
  language:       'es',
  requirements:   '',
  objectives:     '',
  status:         'draft',
})

// Slug auto-generated from title (without timestamp)
function toSlug(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200)
}

// URL validation
function isValidUrl(str) {
  if (!str) return true
  try { new URL(str); return true } catch { return false }
}
const thumbnailUrlValid = computed(() => isValidUrl(form.value.thumbnail_url))
const demoVideoUrlValid = computed(() => isValidUrl(form.value.demo_video_url))
const thumbnailLoading = ref(false)
const thumbnailError = ref(false)
let thumbnailTimer = null

watch(() => form.value.thumbnail_url, (newUrl, oldUrl) => {
  thumbnailError.value = false
  if (thumbnailTimer) clearTimeout(thumbnailTimer)
  if (!newUrl || newUrl === oldUrl || !isValidUrl(newUrl)) {
    thumbnailLoading.value = false
    return
  }
  thumbnailLoading.value = true
  thumbnailTimer = setTimeout(() => { thumbnailLoading.value = false }, 8000)
})

function getPayload() {
  return {
    title:          form.value.title,
    description:    form.value.description,
    price:          form.value.price,
    currency:       form.value.currency,
    thumbnail_url:  form.value.thumbnail_url || null,
    demo_video_url: form.value.demo_video_url || null,
    level:          form.value.level,
    category_id:    form.value.category_id || null,
    language:       form.value.language,
    requirements:   form.value.requirements || null,
    objectives:     form.value.objectives || null,
    status:         form.value.status,
  }
}

// Auto-save function
async function autoSave() {
  if (!form.value.title.trim()) return
  if (retryCount >= MAX_RETRIES) {
    saveStatus.value = 'error'
    return
  }

  if (!isEdit.value && !courseStore.currentCourse?.id) {
    if (isCreating) return
    isCreating = true
    saveStatus.value = 'saving'
    try {
      const slug = toSlug(form.value.title)
      const data = await courseStore.createCourse({
        instructor_id: auth.user.id,
        slug,
        ...getPayload(),
      })
      if (data) {
        await router.replace(`/courses/${slug}/edit`)
        saveStatus.value = 'saved'
        lastSaved.value = new Date()
        retryCount = 0
        // BUG-L01: Reset unsaved changes baseline after successful auto-save
        originalForm.value = JSON.parse(JSON.stringify(form.value))
        hasUnsavedChanges.value = false
      }
    } catch (err) {
      console.error('Auto-save error:', err)
      retryCount++
      saveStatus.value = retryCount >= MAX_RETRIES ? 'error' : 'idle'
      isCreating = false
      if (retryCount >= MAX_RETRIES) toast.error('Error al guardar. Verificá tu conexión.')
    }
  } else if (isEdit.value && courseStore.currentCourse?.id) {
    saveStatus.value = 'saving'
    try {
      await courseStore.updateCourse(courseStore.currentCourse.id, getPayload())
      saveStatus.value = 'saved'
      lastSaved.value = new Date()
      retryCount = 0
      // BUG-L01: Reset unsaved changes baseline after successful auto-save
      originalForm.value = JSON.parse(JSON.stringify(form.value))
      hasUnsavedChanges.value = false
    } catch (err) {
      console.error('Auto-save error:', err)
      retryCount++
      saveStatus.value = retryCount >= MAX_RETRIES ? 'error' : 'idle'
      if (retryCount >= MAX_RETRIES) toast.error('Error al guardar. Verificá tu conexión.')
    }
  }
}

// Debounced auto-save (triggers 1.5s after last change)
function scheduleAutoSave() {
  if (!form.value.title.trim()) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    autoSave()
  }, 1500)
}

function retrySave() {
  retryCount = 0
  saveStatus.value = 'idle'
  autoSave()
}

// Watch all form fields for changes
watch(form, () => {
    if (form.value.title.trim()) {
      scheduleAutoSave()
    }
    if (originalForm.value) {
      hasUnsavedChanges.value = JSON.stringify(form.value) !== JSON.stringify(originalForm.value)
    }
  }, { deep: true })

// Manual submit (same as before but without redirect)
async function submit() {
  if (!form.value.title.trim()) {
    error.value = 'El título es obligatorio.'
    return
  }

  loading.value = true
  error.value = null

  try {
    if (isEdit.value) {
      if (!courseStore.currentCourse?.id) { error.value = 'Curso no encontrado'; return }
      await courseStore.updateCourse(courseStore.currentCourse.id, getPayload())
    } else {
      const slug = toSlug(form.value.title)
      await courseStore.createCourse({
        instructor_id: auth.user.id,
        slug,
        ...getPayload(),
      })
    }
    router.push('/dashboard')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// Format time ago
function timeAgo(date) {
  if (!date) return ''
  const seconds = Math.floor((new Date() - date) / 1000)
  if (seconds < 5) return 'ahora'
  if (seconds < 60) return `hace ${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `hace ${minutes}m`
}

// Update time ago every 30s
let timeInterval = null
let visibilityHandler = null
const timeAgoText = ref('')
onMounted(async () => {
  timeInterval = setInterval(() => {
    if (lastSaved.value) timeAgoText.value = timeAgo(lastSaved.value)
  }, 30000)

  // Reset save status when user returns to tab
  visibilityHandler = () => {
    if (!document.hidden && saveStatus.value === 'saving') {
      saveStatus.value = 'idle'
    }
  }
  document.addEventListener('visibilitychange', visibilityHandler)

  // Load categories
  const { data: cats } = await supabase.from('categories').select('id, name').order('name')
  categories.value = cats ?? []

    if (isEdit.value) {
    await courseStore.fetchCourseBySlug(route.params.slug)
    const c = courseStore.currentCourse
    if (c) {
      form.value = {
        title:          c.title,
        description:    c.description || '',
        price:          c.price,
        currency:       c.currency,
        thumbnail_url:  c.thumbnail_url || '',
        demo_video_url: c.demo_video_url || '',
        level:          c.level || 'beginner',
        category_id:    c.category_id || null,
        language:       c.language || 'es',
        requirements:   c.requirements || '',
        objectives:     c.objectives || '',
        status:         c.status,
      }
      originalForm.value = JSON.parse(JSON.stringify(form.value))
    }
  }

  beforeUnloadHandler = (e) => {
    if (hasUnsavedChanges.value) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', beforeUnloadHandler)
})

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (timeInterval) clearInterval(timeInterval)
  if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler)
  if (beforeUnloadHandler) window.removeEventListener('beforeunload', beforeUnloadHandler)
})
</script>

<template>
  <div class="min-h-screen px-6 py-12">
    <div class="mx-auto max-w-2xl">

      <!-- Header -->
      <div class="mb-8 flex items-start justify-between gap-4">
        <div>
          <RouterLink to="/dashboard" class="mb-4 inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Volver al dashboard
          </RouterLink>
          <h1 class="text-3xl font-extrabold text-text-primary">
            {{ isEdit ? 'Editar curso' : 'Crear nuevo curso' }}
          </h1>
        </div>

        <!-- Auto-save status -->
        <div v-if="form.title.trim()" class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          :class="{
            'border-surface-lighter text-text-muted': saveStatus === 'idle',
            'border-primary/30 bg-primary/5 text-primary-light': saveStatus === 'saving',
            'border-success/30 bg-success/5 text-success': saveStatus === 'saved',
            'border-error/30 bg-error/5 text-error': saveStatus === 'error',
          }"
        >
          <template v-if="saveStatus === 'saving'">
            <div class="h-3 w-3 animate-spin rounded-full border-2 border-primary-light border-t-transparent" />
            <span>Guardando...</span>
          </template>
          <template v-else-if="saveStatus === 'saved'">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <span>Guardado {{ timeAgoText || 'ahora' }}</span>
          </template>
          <template v-else-if="saveStatus === 'error'">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <span>Error al guardar</span>
            <button @click="retrySave" class="ml-1 underline hover:text-text-primary">Reintentar</button>
          </template>
        </div>
      </div>

      <div class="glass-card p-8">
        <form @submit.prevent="submit" class="space-y-6">

          <!-- Title -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text-secondary">Título <span class="text-error">*</span></label>
            <input
              v-model="form.title"
              type="text"
              required
              placeholder="Ej: Introducción a Vue 3"
              class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-3 text-text-primary placeholder-text-muted outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <!-- Description -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text-secondary">Descripción</label>
            <textarea
              v-model="form.description"
              rows="4"
              placeholder="Describí de qué trata tu curso, qué van a aprender los alumnos..."
              class="w-full resize-none rounded-lg border border-surface-lighter bg-surface px-4 py-3 text-text-primary placeholder-text-muted outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <!-- Price -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text-secondary">Precio (ARS)</label>
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">$</span>
              <input
                v-model.number="form.price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                class="w-full rounded-lg border border-surface-lighter bg-surface pl-8 pr-4 py-3 text-text-primary placeholder-text-muted outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <p class="mt-1 text-xs text-text-muted">Los precios son en pesos argentinos (ARS)</p>
          </div>

          <!-- Thumbnail URL -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text-secondary">URL de imagen de portada</label>
            <input
              v-model="form.thumbnail_url"
              type="url"
              placeholder="https://..."
              :class="['w-full rounded-lg border bg-surface px-4 py-3 text-text-primary placeholder-text-muted outline-none transition focus:ring-1 focus:ring-primary/30', form.thumbnail_url && !thumbnailUrlValid ? 'border-error/50 focus:border-error/50' : 'border-surface-lighter focus:border-primary/50']"
            />
            <p v-if="form.thumbnail_url && !thumbnailUrlValid" class="mt-1 text-xs text-error">URL inválida — usá https://</p>
            <div v-if="form.thumbnail_url && thumbnailUrlValid" class="mt-3 aspect-video w-full overflow-hidden rounded-lg bg-surface-lighter">
              <img v-if="!thumbnailLoading" :src="form.thumbnail_url" alt="Preview" class="h-full w-full object-cover" @load="thumbnailLoading = false" @error="thumbnailError = true; thumbnailLoading = false" />
              <div v-if="thumbnailLoading" class="flex h-full w-full items-center justify-center">
                <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
              <div v-if="thumbnailError" class="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
                <svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
                <span class="text-xs">No se pudo cargar la imagen</span>
              </div>
            </div>
          </div>

          <!-- Demo Video URL -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text-secondary">URL del video demo/trailer</label>
            <input
              v-model="form.demo_video_url"
              type="url"
              placeholder="https://youtube.com/watch?v=... o https://vimeo.com/..."
              :class="['w-full rounded-lg border bg-surface px-4 py-3 text-text-primary placeholder-text-muted outline-none transition focus:ring-1 focus:ring-primary/30', form.demo_video_url && !demoVideoUrlValid ? 'border-error/50 focus:border-error/50' : 'border-surface-lighter focus:border-primary/50']"
            />
            <p v-if="form.demo_video_url && !demoVideoUrlValid" class="mt-1 text-xs text-error">URL inválida — usá https://</p>
            <p v-else class="mt-1 text-xs text-text-muted">Video de preview que verán los alumnos antes de comprar. Soporta YouTube y Vimeo.</p>
          </div>

          <!-- Level + Category -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="mb-1.5 block text-sm font-medium text-text-secondary">Nivel</label>
              <select
                v-model="form.level"
                class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-3 text-text-primary outline-none transition focus:border-primary/50"
              >
                <option value="beginner">Principiante</option>
                <option value="intermediate">Intermedio</option>
                <option value="advanced">Avanzado</option>
              </select>
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium text-text-secondary">Categoría</label>
              <select
                v-model="form.category_id"
                class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-3 text-text-primary outline-none transition focus:border-primary/50"
              >
                <option :value="null">Sin categoría</option>
                <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
              </select>
            </div>
          </div>

          <!-- Language -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text-secondary">Idioma</label>
            <select
              v-model="form.language"
              class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-3 text-text-primary outline-none transition focus:border-primary/50"
            >
              <option value="es">Español</option>
              <option value="en">Inglés</option>
              <option value="pt">Portugués</option>
              <option value="fr">Francés</option>
            </select>
          </div>

          <!-- Requirements -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text-secondary">Requisitos previos</label>
            <textarea
              v-model="form.requirements"
              rows="3"
              placeholder="Ej: Conocimientos básicos de HTML y CSS..."
              class="w-full resize-none rounded-lg border border-surface-lighter bg-surface px-4 py-3 text-text-primary placeholder-text-muted outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <!-- Objectives -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text-secondary">¿Qué aprenderán los alumnos?</label>
            <textarea
              v-model="form.objectives"
              rows="3"
              placeholder="Ej: Crear aplicaciones web completas con Vue 3..."
              class="w-full resize-none rounded-lg border border-surface-lighter bg-surface px-4 py-3 text-text-primary placeholder-text-muted outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <!-- Status -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text-secondary">Estado</label>
            <div class="flex gap-3">
              <label
                v-for="opt in [{ value: 'draft', label: 'Borrador' }, { value: 'published', label: 'Publicado' }]"
                :key="opt.value"
                class="flex flex-1 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition"
                :class="form.status === opt.value
                  ? 'border-primary/50 bg-primary/10 text-text-primary'
                  : 'border-surface-lighter text-text-muted hover:border-surface-lighter/80'"
              >
                <input v-model="form.status" type="radio" :value="opt.value" class="accent-primary" />
                {{ opt.label }}
              </label>
            </div>
          </div>

          <!-- Error -->
          <div v-if="error" class="rounded-lg border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
            {{ error }}
          </div>

          <!-- Actions -->
          <div class="flex gap-3 pt-2">
            <RouterLink to="/dashboard" class="flex-1 rounded-lg border border-surface-lighter py-3 text-center text-sm text-text-secondary transition hover:border-primary/30 hover:text-text-primary">
              Cancelar
            </RouterLink>
            <button
              type="submit"
              :disabled="loading"
              class="btn-primary flex-1 py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear curso' }}
            </button>
          </div>

        </form>
      </div>
    </div>
  </div>
</template>
