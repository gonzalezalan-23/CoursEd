<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import { supabase } from '@/services/supabase'
import { formatCurrency } from '@/utils/format'

const auth = useAuthStore()
const { confirm } = useConfirm()
const toast = useToast()

const tab           = ref('learning')  // 'learning' | 'teaching'
const enrollments   = ref([])
const myCourses     = ref([])
const loading       = ref(true)
const deleteLoading = ref(null)
const teachingLoaded = ref(false)

// Pagination
const learningPage = ref(1)
const teachingPage = ref(1)
const itemsPerPage = 9

const paginatedEnrollments = computed(() => {
  const start = (learningPage.value - 1) * itemsPerPage
  return enrollments.value.slice(start, start + itemsPerPage)
})

const paginatedMyCourses = computed(() => {
  const start = (teachingPage.value - 1) * itemsPerPage
  return myCourses.value.slice(start, start + itemsPerPage)
})

const totalLearningPages = computed(() => Math.ceil(enrollments.value.length / itemsPerPage))
const totalTeachingPages = computed(() => Math.ceil(myCourses.value.length / itemsPerPage))

const isInstructor = computed(() => auth.isInstructor)

const membershipBadge = computed(() => {
  const name = auth.membershipName
  if (name === 'VIP')   return { label: 'VIP',   cls: 'border-amber-500/30 bg-amber-500/10 text-amber-400' }
  if (name === 'Pro')   return { label: 'Pro',   cls: 'border-violet-500/30 bg-violet-500/10 text-violet-400' }
  return                       { label: 'Básico', cls: 'border-surface-lighter bg-surface-light text-text-muted' }
})

async function loadEnrollments() {
  try {
    const { data, error } = await supabase
      .from('enrollments')
      .select(`
        id, amount_paid, status, enrolled_at,
        course:courses(id, title, slug, thumbnail_url, price, currency,
          instructor:profiles!instructor_id(full_name),
          modules(id, order_index,
            lessons(id, order_index)
          )
        )
      `)
      .eq('user_id', auth.user.id)
      .eq('status', 'active')
      .order('enrolled_at', { ascending: false })

    // BUG-M07: Show toast on error instead of failing silently
    if (error) {
      console.error('Error loading enrollments:', error)
      toast.error('Error al cargar tus inscripciones.')
      return
    }

    enrollments.value = (data || []).map(e => ({
      ...e,
      firstLessonId: [...(e.course.modules ?? [])]
        .sort((a, b) => a.order_index - b.order_index)[0]
        ?.lessons?.slice()?.sort((a, b) => a.order_index - b.order_index)[0]?.id ?? null
    }))
  } catch (err) {
    console.error('Error loading enrollments:', err)
    toast.error('Error al cargar tus inscripciones.')
  }
}

async function loadMyCourses() {
  try {
    const { data, error } = await supabase
      .from('courses')
      .select('id, title, slug, thumbnail_url, price, currency, status, created_at')
      .eq('instructor_id', auth.user.id)
      .order('created_at', { ascending: false })

    // BUG-M07: Show toast on error instead of failing silently
    if (error) {
      console.error('Error loading courses:', error)
      toast.error('Error al cargar tus cursos.')
      return
    }

    myCourses.value = data || []
  } catch (err) {
    console.error('Error loading courses:', err)
    toast.error('Error al cargar tus cursos.')
  }
}

async function togglePublish(course) {
  const newStatus = course.status === 'published' ? 'draft' : 'published'
  const confirmed = await confirm({
    title: newStatus === 'published' ? 'Publicar curso' : 'Despublicar curso',
    message: newStatus === 'published'
      ? '¿Publicar este curso? Será visible para todos los alumnos.'
      : '¿Despublicar este curso? Dejará de ser visible para los alumnos.',
    confirmText: newStatus === 'published' ? 'Publicar' : 'Despublicar',
    cancelText: 'Cancelar',
    variant: newStatus === 'published' ? 'info' : 'warning',
  })
  if (!confirmed) return

  try {
    const { error } = await supabase
      .from('courses')
      .update({ status: newStatus })
      .eq('id', course.id)

    if (error) {
      // BUG-M07: Show toast on error instead of failing silently
      console.error('Error toggling publish:', error)
      toast.error('Error al cambiar el estado del curso.')
    } else {
      course.status = newStatus
      toast.success(newStatus === 'published' ? 'Curso publicado.' : 'Curso despublicado.')
    }
  } catch (err) {
    console.error('Error toggling publish:', err)
    toast.error('Error al cambiar el estado del curso.')
  }
}

async function deleteCourse(courseId) {
  const confirmed = await confirm({
    title: 'Eliminar curso',
    message: '¿Seguro que querés eliminar este curso? Esta acción no se puede deshacer.',
    confirmText: 'Eliminar',
    cancelText: 'Cancelar',
    variant: 'danger',
  })
  if (!confirmed) return
  deleteLoading.value = courseId
  try {
    const { error } = await supabase.from('courses').delete().eq('id', courseId)
    if (error) {
      // BUG-M07: Show toast on error instead of failing silently
      console.error('Error deleting course:', error)
      toast.error('Error al eliminar el curso.')
    } else {
      myCourses.value = myCourses.value.filter(c => c.id !== courseId)
      toast.success('Curso eliminado.')
    }
  } catch (err) {
    console.error('Error deleting course:', err)
    toast.error('Error al eliminar el curso.')
  }
  deleteLoading.value = null
}

onMounted(async () => {
  if (!auth.user) { loading.value = false; return }
  loading.value = true
  await Promise.all([loadEnrollments(), isInstructor.value ? loadMyCourses() : Promise.resolve()]).catch(err => console.error('Dashboard load error:', err))
  loading.value = false
})
</script>

<template>
  <div class="min-h-screen px-6 py-12">
    <div class="mx-auto max-w-5xl">

      <!-- Header -->
      <div class="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-extrabold text-text-primary">
            Hola, {{ auth.profile?.full_name?.split(' ')[0] }} 👋
          </h1>
          <p class="mt-1 text-text-muted">Bienvenido a tu panel de control</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="rounded-full border px-3 py-1 text-sm font-medium" :class="membershipBadge.cls">
            {{ membershipBadge.label }}
          </span>
          <RouterLink v-if="isInstructor" to="/courses/new" class="btn-primary text-sm">
            + Nuevo curso
          </RouterLink>
        </div>
      </div>

      <!-- Tabs (only show teaching tab if instructor) -->
      <div class="mb-8 flex gap-1 rounded-xl bg-surface-light p-1 w-fit">
        <button
          @click="tab = 'learning'"
          class="rounded-lg px-5 py-2 text-sm font-medium transition-all"
          :class="tab === 'learning' ? 'bg-primary text-white shadow' : 'text-text-muted hover:text-text-primary'"
        >
          Mis cursos
        </button>
        <button
          v-if="isInstructor"
          @click="tab = 'teaching'; if (!teachingLoaded) { loadMyCourses(); teachingLoaded = true }"
          class="rounded-lg px-5 py-2 text-sm font-medium transition-all"
          :class="tab === 'teaching' ? 'bg-primary text-white shadow' : 'text-text-muted hover:text-text-primary'"
        >
          Mis publicaciones
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-20">
        <div class="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>

      <!-- ── TAB: Learning ── -->
      <div v-else-if="tab === 'learning'">
        <div v-if="enrollments.length === 0" class="glass-card p-12 text-center">
          <svg class="mx-auto mb-4 h-14 w-14 text-text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
          <p class="text-lg font-semibold text-text-primary">Todavía no compraste ningún curso</p>
          <p class="mt-2 text-sm text-text-muted">Explorá el catálogo y empezá a aprender hoy.</p>
          <RouterLink to="/courses" class="btn-primary mt-6 inline-block">Ver cursos</RouterLink>
        </div>

        <div v-else class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <RouterLink
            v-for="e in paginatedEnrollments"
            :key="e.id"
            :to="e.firstLessonId ? `/learn/${e.course.id}/lesson/${e.firstLessonId}` : `/courses/${e.course.slug}`"
            class="glass-card group block overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-[0_4px_24px_rgba(99,102,241,0.15)]"
          >
            <div class="aspect-video overflow-hidden bg-surface-lighter">
              <img v-if="e.course.thumbnail_url" :src="e.course.thumbnail_url" :alt="e.course.title" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div v-else class="flex h-full w-full items-center justify-center">
                <svg class="h-10 w-10 text-text-muted/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
              </div>
            </div>
            <div class="p-4">
              <p class="font-semibold text-text-primary line-clamp-2 group-hover:text-primary-light transition-colors">{{ e.course.title }}</p>
              <p class="mt-1 text-xs text-text-muted">{{ e.course.instructor?.full_name }}</p>
              <div class="mt-3 flex items-center justify-between">
                <span class="rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">Activo</span>
                <RouterLink
                  v-if="e.firstLessonId"
                  :to="`/learn/${e.course.id}/lesson/${e.firstLessonId}`"
                  class="text-xs font-medium text-primary-light hover:underline"
                  @click.stop
                >
                  Continuar →
                </RouterLink>
              </div>
            </div>
          </RouterLink>
        </div>

        <!-- Learning Pagination -->
        <div v-if="totalLearningPages > 1" class="mt-8 flex items-center justify-center gap-2">
          <button
            @click="learningPage--"
            :disabled="learningPage === 1"
            class="rounded-lg border border-surface-lighter px-3 py-1.5 text-sm text-text-secondary transition hover:border-primary/30 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Anterior
          </button>
          <span class="text-sm text-text-muted">Página {{ learningPage }} de {{ totalLearningPages }}</span>
          <button
            @click="learningPage++"
            :disabled="learningPage === totalLearningPages"
            class="rounded-lg border border-surface-lighter px-3 py-1.5 text-sm text-text-secondary transition hover:border-primary/30 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente →
          </button>
        </div>
      </div>

      <!-- ── TAB: Teaching ── -->
      <div v-else-if="tab === 'teaching'">
        <div v-if="myCourses.length === 0" class="glass-card p-12 text-center">
          <p class="text-lg font-semibold text-text-primary">Todavía no publicaste ningún curso</p>
          <p class="mt-2 text-sm text-text-muted">Creá tu primer curso y empezá a generar ingresos.</p>
          <RouterLink to="/courses/new" class="btn-primary mt-6 inline-block">Crear curso</RouterLink>
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="course in paginatedMyCourses"
            :key="course.id"
            class="glass-card flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap"
          >
            <!-- Thumbnail -->
            <div class="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-lighter">
              <img v-if="course.thumbnail_url" :src="course.thumbnail_url" :alt="course.title" class="h-full w-full object-cover" />
            </div>

            <!-- Info -->
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold text-text-primary">{{ course.title }}</p>
              <p class="mt-0.5 text-sm text-text-muted">{{ formatCurrency(course.price, course.currency) }}</p>
            </div>

            <!-- Status badge -->
            <span
              class="shrink-0 rounded-full border px-3 py-1 text-xs font-medium"
              :class="{
                'border-success/30 bg-success/10 text-success': course.status === 'published',
                'border-warning/30 bg-warning/10 text-warning': course.status === 'draft',
                'border-surface-lighter bg-surface-light text-text-muted': course.status === 'archived',
              }"
            >
              {{ course.status === 'published' ? 'Publicado' : course.status === 'draft' ? 'Borrador' : 'Archivado' }}
            </span>

            <!-- Actions -->
            <div class="flex shrink-0 flex-wrap items-center gap-2">
              <RouterLink :to="`/courses/${course.slug}`" class="rounded-lg border border-surface-lighter px-3 py-1.5 text-xs text-text-secondary transition hover:border-primary/30 hover:text-text-primary">
                Ver
              </RouterLink>
              <RouterLink :to="`/courses/${course.slug}/content`" class="rounded-lg border border-surface-lighter px-3 py-1.5 text-xs text-text-secondary transition hover:border-primary/30 hover:text-text-primary">
                Contenido
              </RouterLink>
              <RouterLink :to="`/courses/${course.slug}/edit`" class="rounded-lg border border-surface-lighter px-3 py-1.5 text-xs text-text-secondary transition hover:border-primary/30 hover:text-text-primary">
                Info
              </RouterLink>
              <button
                @click="togglePublish(course)"
                class="rounded-lg border px-3 py-1.5 text-xs transition"
                :class="course.status === 'published'
                  ? 'border-warning/30 text-warning hover:bg-warning/10'
                  : 'border-success/30 text-success hover:bg-success/10'"
              >
                {{ course.status === 'published' ? 'Despublicar' : 'Publicar' }}
              </button>
              <button
                @click="deleteCourse(course.id)"
                :disabled="deleteLoading === course.id"
                class="rounded-lg border border-error/30 px-3 py-1.5 text-xs text-error transition hover:bg-error/10 disabled:opacity-50"
              >
                {{ deleteLoading === course.id ? '...' : 'Eliminar' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Teaching Pagination -->
        <div v-if="totalTeachingPages > 1" class="mt-8 flex items-center justify-center gap-2">
          <button
            @click="teachingPage--"
            :disabled="teachingPage === 1"
            class="rounded-lg border border-surface-lighter px-3 py-1.5 text-sm text-text-secondary transition hover:border-primary/30 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Anterior
          </button>
          <span class="text-sm text-text-muted">Página {{ teachingPage }} de {{ totalTeachingPages }}</span>
          <button
            @click="teachingPage++"
            :disabled="teachingPage === totalTeachingPages"
            class="rounded-lg border border-surface-lighter px-3 py-1.5 text-sm text-text-secondary transition hover:border-primary/30 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente →
          </button>
        </div>
      </div>

    </div>
  </div>
</template>
