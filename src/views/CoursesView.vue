<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router' // <- Agregamos esto
import { getPublishedCourses } from '@/services/courseService'
import CourseCard from '@/components/CourseCard.vue'

const route = useRoute()
const router = useRouter()

// Inicializamos con lo que venga en la URL (o los valores por defecto)
const search  = ref(route.query.search || '')
const sortBy  = ref(route.query.sort || 'created_at')
const page    = ref(Number(route.query.page) || 1)
const debouncedSearch = ref(search.value)

const courses    = ref([])
const loading    = ref(true)
const error      = ref(null)
const totalCount = ref(0)

const LIMIT   = 12

let debounceTimer = null

watch(search, val => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    // BUG-L14: only reset page when the value actually changed (URL-driven sync must not reset page)
    if (debouncedSearch.value !== val) {
      debouncedSearch.value = val
      page.value = 1
    }
  }, 400)
})

onUnmounted(() => {
  clearTimeout(debounceTimer)
})

// Nuevo watcher para actualizar la URL sin recargar la página
watch([debouncedSearch, sortBy, page], () => {
  router.replace({
    query: {
      search: debouncedSearch.value || undefined,
      sort: sortBy.value !== 'created_at' ? sortBy.value : undefined,
      page: page.value > 1 ? page.value : undefined
    }
  })
  load()
})

// BUG-L14: Back/forward navigation must sync the UI (search/sort/page) with the URL
watch(() => route.query, (q) => {
  const nextSearch = typeof q.search === 'string' ? q.search : ''
  const nextSort   = typeof q.sort === 'string' && q.sort ? q.sort : 'created_at'
  const nextPage   = Number(q.page) > 0 ? Number(q.page) : 1

  if (search.value !== nextSearch) {
    search.value = nextSearch
    debouncedSearch.value = nextSearch // apply immediately, no debounce for URL changes
  }
  if (sortBy.value !== nextSort) sortBy.value = nextSort
  if (page.value !== nextPage) page.value = nextPage
})

async function load() {
  loading.value = true
  error.value = null

  const ascending = sortBy.value === 'price_asc' || sortBy.value === 'title'
  const realSortBy = sortBy.value === 'price_asc' || sortBy.value === 'price_desc' ? 'price' : sortBy.value

  const result = await getPublishedCourses({
    search: debouncedSearch.value,
    sortBy: realSortBy,
    ascending,
    limit: LIMIT,
    offset: (page.value - 1) * LIMIT,
  })

  if (result.error) {
    error.value = result.error
  } else {
    courses.value = result.data
    totalCount.value = result.count ?? result.data.length
  }

  loading.value = false
}

const totalPages = computed(() => Math.ceil(totalCount.value / LIMIT))

onMounted(load)
</script>

<template>
  <div class="min-h-screen px-6 py-12">
    <div class="mx-auto max-w-6xl">

      <!-- Header -->
      <div class="mb-10">
        <h1 class="text-3xl font-extrabold text-text-primary">Explorar cursos</h1>
        <p class="mt-2 text-text-muted">Encontrá el curso perfecto para tu próximo objetivo</p>
      </div>

      <!-- Filters -->
      <div class="mb-8 flex flex-wrap gap-3">
        <!-- Search -->
        <div class="relative flex-1 min-w-[200px]">
          <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            v-model="search"
            type="text"
            placeholder="Buscar cursos..."
            class="w-full rounded-lg border border-surface-lighter bg-surface-light pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
          />
        </div>

        <!-- Sort -->
        <select
          v-model="sortBy"
          class="rounded-lg border border-surface-lighter bg-surface-light px-4 py-2.5 text-sm text-text-primary outline-none transition focus:border-primary/50"
        >
          <option value="created_at">Más recientes</option>
          <option value="price_asc">Precio: menor a mayor</option>
          <option value="price_desc">Precio: mayor a menor</option>
          <option value="title">Título A-Z</option>
        </select>
      </div>

      <!-- Results count -->
      <p v-if="!loading && totalCount > 0" class="mb-6 text-sm text-text-muted">
        {{ totalCount }} curso{{ totalCount !== 1 ? 's' : '' }} encontrado{{ totalCount !== 1 ? 's' : '' }}
        <span v-if="debouncedSearch"> para "{{ debouncedSearch }}"</span>
      </p>

      <!-- Loading skeleton -->
      <div v-if="loading" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="n in LIMIT" :key="n" class="glass-card animate-pulse overflow-hidden">
          <div class="aspect-video bg-surface-lighter" />
          <div class="space-y-3 p-5">
            <div class="h-4 w-3/4 rounded bg-surface-lighter" />
            <div class="h-3 w-full rounded bg-surface-lighter/60" />
            <div class="h-3 w-2/3 rounded bg-surface-lighter/40" />
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="glass-card mx-auto max-w-md p-8 text-center">
        <p class="text-error">{{ error }}</p>
        <button @click="load" class="btn-primary mt-4">Reintentar</button>
      </div>

      <!-- Empty -->
      <div v-else-if="courses.length === 0" class="glass-card mx-auto max-w-md p-12 text-center">
        <p class="text-lg font-semibold text-text-primary">
          {{ debouncedSearch ? 'Sin resultados' : 'Aún no hay cursos' }}
        </p>
        <p class="mt-2 text-sm text-text-muted">
          {{ debouncedSearch ? `No encontramos cursos para "${debouncedSearch}".` : 'Volvé pronto.' }}
        </p>
        <button v-if="debouncedSearch" @click="search = ''" class="btn-primary mt-6">Limpiar búsqueda</button>
      </div>

      <!-- Grid -->
      <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <CourseCard v-for="course in courses" :key="course.id" :course="course" />
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-12 flex items-center justify-center gap-2">
        <button
          @click="page--"
          :disabled="page === 1"
          class="rounded-lg border border-surface-lighter px-4 py-2 text-sm text-text-secondary transition hover:border-primary/30 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Anterior
        </button>
        <span class="px-4 text-sm text-text-muted">Página {{ page }} de {{ totalPages }}</span>
        <button
          @click="page++"
          :disabled="page >= totalPages"
          class="rounded-lg border border-surface-lighter px-4 py-2 text-sm text-text-secondary transition hover:border-primary/30 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Siguiente →
        </button>
      </div>

    </div>
  </div>
</template>
