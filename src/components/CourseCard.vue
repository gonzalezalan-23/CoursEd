<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { formatCurrency } from '@/utils/format'

const props = defineProps({
  course: {
    type: Object,
    required: true,
  },
})

const authStore = useAuthStore()

// ─── Discount Logic ───
const discountPercent = computed(() => {
  if (!authStore.isAuthenticated) return 0
  return authStore.membershipDiscount
})

const originalPrice = computed(() => Number(props.course.price) || 0)

const discountedPrice = computed(() => {
  if (discountPercent.value === 0) return originalPrice.value
  return originalPrice.value * (1 - discountPercent.value / 100)
})

const hasDiscount = computed(() => discountPercent.value > 0 && originalPrice.value > 0)
const isFree = computed(() => originalPrice.value === 0)

const membershipBadgeClass = computed(() => {
  const name = authStore.membershipName
  if (name === 'VIP') return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  if (name === 'Pro') return 'bg-violet-500/15 text-violet-400 border-violet-500/30'
  return ''
})

// Instructor initials as avatar fallback
const instructorInitials = computed(() => {
  const name = props.course.profiles?.full_name
  if (!name || !name.trim()) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
})

const instructorName = computed(() => {
  const name = props.course.profiles?.full_name
  return name && name.trim() ? name.trim() : 'Instructor'
})

// BUG-L04: Level label
const levelLabel = computed(() => {
  const labels = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' }
  return labels[props.course.level] ?? ''
})

// BUG-L04: Duration from modules/lessons (only show if > 0)
const totalDuration = computed(() => {
  const lessons = props.course.modules?.flatMap(m => m.lessons || []) || []
  const secs = lessons.reduce((acc, l) => acc + (l.duration_seconds || 0), 0)
  if (secs <= 0) return ''
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
})
</script>

<template>
  <RouterLink
    :to="`/courses/${course.slug}`"
    :aria-label="`Curso: ${course.title}`"
    class="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/50 hover:bg-slate-800/60 hover:shadow-[0_8px_30px_rgba(99,102,241,0.15)]"
  >
    <!-- ── Thumbnail ── -->
    <div class="relative overflow-hidden rounded-xl bg-slate-800">
      <img
        v-if="course.thumbnail_url"
        :src="course.thumbnail_url"
        :alt="course.title"
        class="aspect-video w-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div
        v-else
        class="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-indigo-900/40 to-slate-800"
      >
        <svg class="h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60 60 0 0 0-.491 6.347A48.6 48.6 0 0 0 12 20.904a48.6 48.6 0 0 0 8.232-4.41 60 60 0 0 0-.491-6.347m-15.482 0a50.6 50.6 0 0 0-2.658-.813A60 60 0 0 1 12 3.493a60 60 0 0 1 10.399 5.84 51 51 0 0 0-2.658.814m-15.482 0A51 51 0 0 1 12 13.489a51 51 0 0 1 7.741-3.342" />
        </svg>
      </div>

      <!-- Discount badge -->
      <div
        v-if="hasDiscount"
        class="absolute right-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow-lg backdrop-blur-md"
        :class="authStore.membershipName === 'VIP' ? 'bg-pink-500/90 text-white' : 'bg-indigo-500/90 text-white'"
      >
        -{{ discountPercent }}% {{ authStore.membershipName }}
      </div>

      <!-- Free badge -->
      <div
        v-if="isFree"
        class="absolute left-3 top-3 rounded-full border border-cyan-400/30 bg-cyan-400/20 px-2.5 py-1 text-xs font-bold text-cyan-300 shadow-lg backdrop-blur-md"
      >
        GRATIS
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="mt-4 flex flex-1 flex-col">
      <!-- Title -->
      <h3 class="text-base font-bold leading-tight text-slate-100 transition-colors duration-300 group-hover:text-indigo-400 line-clamp-2">
        {{ course.title }}
      </h3>

      <!-- Description -->
      <p class="mt-2 text-sm leading-relaxed text-slate-400 line-clamp-2">
        {{ course.description }}
      </p>

      <!-- Espaciador flexible para empujar el footer hacia abajo -->
      <div class="mt-auto pt-5">
        
        <!-- Divider -->
        <div class="mb-4 h-px w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent" />

        <!-- BUG-L04: Level and duration badges (duration fed by modules/lessons.duration_seconds in getPublishedCourses) -->
        <!-- BUG-L04: student_count badge removed — column doesn't exist in DB (verified: 42703) -->
        <div class="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span v-if="levelLabel" class="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 font-medium text-indigo-300">
            {{ levelLabel }}
          </span>
          <span v-if="totalDuration" class="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5">
            {{ totalDuration }}
          </span>
        </div>

        <div class="flex items-end justify-between">
          
          <!-- Instructor -->
          <div v-if="course.profiles" class="flex items-center gap-2">
            <div
              v-if="course.profiles.avatar_url"
              class="h-8 w-8 overflow-hidden rounded-full border border-slate-700"
            >
              <img :src="course.profiles.avatar_url" :alt="course.profiles.full_name" class="h-full w-full object-cover" />
            </div>
            <div
              v-else
              class="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300 border border-indigo-500/30"
            >
              {{ instructorInitials }}
            </div>
            <span class="text-xs font-medium text-slate-300">
              {{ instructorName }}
            </span>
          </div>

          <!-- Price -->
          <div class="text-right">
            <div v-if="isFree">
              <span class="text-lg font-extrabold text-cyan-400">Gratis</span>
            </div>
            <div v-else-if="hasDiscount" class="flex flex-col items-end">
              <span class="text-xs text-slate-500 line-through">
                {{ formatCurrency(originalPrice, course.currency) }}
              </span>
              <span class="text-lg font-extrabold text-indigo-400">
                {{ formatCurrency(discountedPrice, course.currency) }}
              </span>
            </div>
            <div v-else>
              <span class="text-lg font-extrabold text-slate-100">
                {{ formatCurrency(originalPrice, course.currency) }}
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  </RouterLink>
</template>
