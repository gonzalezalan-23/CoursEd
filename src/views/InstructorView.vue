<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { supabase } from '@/services/supabase'

const route = useRoute()
const router = useRouter()
const instructorId = computed(() => route.params.id)

const instructor = ref(null)
const courses = ref([])
const loading = ref(true)
const error = ref(null)

async function loadInstructor() {
  loading.value = true
  error.value = null
  try {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id,full_name,avatar_url,bio')
      .eq('id', instructorId.value)
      .single()

    if (profileErr) throw profileErr
    instructor.value = profile

    const { data: courseData, error: courseErr } = await supabase
      .from('courses')
      .select('id,title,slug,thumbnail_url,price')
      .eq('instructor_id', instructorId.value)
      .eq('status', 'published')
      .order('created_at', { ascending: false })

    if (courseErr) throw courseErr
    courses.value = courseData || []
  } catch (err) {
    error.value = err.message || String(err)
  } finally {
    loading.value = false
  }
}

watch(instructorId, (id) => {
  if (!id) { router.push('/'); return }
  loadInstructor()
}, { immediate: true })
</script>

<template>
  <div class="min-h-screen bg-surface text-slate-100 py-12">
    <div class="mx-auto max-w-4xl px-6">
      <div v-if="loading" class="flex justify-center py-20">
        <div class="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
      <div v-else-if="error" class="p-6 rounded-md bg-pink-900/30">{{ error }}</div>
      <div v-else>
        <div class="flex items-center gap-4">
          <img v-if="instructor.avatar_url" :src="instructor.avatar_url" :alt="instructor.full_name" class="h-20 w-20 rounded-full object-cover" />
          <div v-else class="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-500/20 text-2xl font-bold text-indigo-300">
            {{ instructor.full_name?.charAt(0)?.toUpperCase() || '?' }}
          </div>
          <div>
            <h1 class="text-2xl font-extrabold">{{ instructor.full_name }}</h1>
            <p class="text-sm text-slate-400 mt-1">{{ instructor.bio }}</p>
          </div>
        </div>

        <div class="mt-8">
          <h2 class="text-xl font-semibold">Cursos publicados</h2>
          <div v-if="courses.length === 0" class="mt-4 text-slate-400">Este instructor no tiene cursos publicados aún.</div>
          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <div v-for="c in courses" :key="c.id" class="rounded-lg border border-slate-800 p-4">
              <div class="flex items-center gap-4">
                <img v-if="c.thumbnail_url" :src="c.thumbnail_url" :alt="c.title" class="h-20 w-28 rounded-md object-cover" />
                <div>
                  <h3 class="font-semibold">{{ c.title }}</h3>
                  <RouterLink :to="`/courses/${c.slug}`" class="text-sm text-indigo-400">Ver curso</RouterLink>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
