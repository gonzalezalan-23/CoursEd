import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/services/supabase'

export const useCourseStore = defineStore('courses', () => {
  // --- State ---
  const courses = ref([])
  const currentCourse = ref(null)
  const loading = ref(false)
  const error = ref(null)

  // --- Getters ---
  const publishedCourses = computed(() => courses.value.filter(c => c.status === 'published'))

  const featuredCourses = computed(() => publishedCourses.value.filter(c => c.is_featured).slice(0, 6))

  // --- Actions ---
  async function fetchCourses() {
    loading.value = true
    error.value = null

    try {
      const { data, error: supabaseError } = await supabase
        .from('courses')
        .select(`
          id,
          title,
          slug,
          description,
          thumbnail_url,
          price,
          currency,
          status,
          level,
          language,
          is_featured,
          created_at,
          category:category_id ( id, name, slug ),
          profiles:instructor_id (id, full_name, avatar_url)
        `)
        .eq('status', 'published')
        .order('created_at', { ascending: false })

      if (supabaseError) throw supabaseError

      courses.value = data || []
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  async function fetchCourseBySlug(slug) {
    loading.value = true
    error.value = null

    try {
      const { data, error: supabaseError } = await supabase
        .from('courses')
        .select(`
          *,
          category:category_id ( id, name, slug ),
          profiles:instructor_id (
            id,
            full_name,
            avatar_url,
            bio
          ),
          modules (
            id,
            title,
            description,
            order_index,
            lessons (
              id,
              title,
              description,
              duration_seconds,
              is_free_preview,
              order_index
            )
          )
        `)
        .eq('slug', slug)
        .single()

      if (supabaseError) throw supabaseError

      // BUG-049: Clone arrays instead of mutating original data
      if (data.modules) {
        data.modules = [...data.modules].sort((a, b) => a.order_index - b.order_index)
        data.modules.forEach((mod) => {
          if (mod.lessons) {
            mod.lessons = [...mod.lessons].sort((a, b) => a.order_index - b.order_index)
          }
        })
      }

      currentCourse.value = data
      return data
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createCourse(courseData) {
    loading.value = true
    error.value = null

    try {
      const { data, error: supabaseError } = await supabase
        .from('courses')
        .insert(courseData)
        .select()

      if (supabaseError) throw supabaseError

      if (data && data.length > 0) {
        currentCourse.value = data[0]
        courses.value.push(data[0])
        return data[0]
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updateCourse(courseId, updates) {
    loading.value = true
    error.value = null

    try {
      const { data, error: supabaseError } = await supabase
        .from('courses')
        .update(updates)
        .eq('id', courseId)
        .select()

      if (supabaseError) throw supabaseError

      if (data && data.length > 0) {
        currentCourse.value = data[0]
        const index = courses.value.findIndex(c => c.id === courseId)
        if (index !== -1) {
          courses.value.splice(index, 1, data[0])
        }
        return data[0]
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deleteCourse(courseId) {
    loading.value = true
    error.value = null

    try {
      const { error: supabaseError } = await supabase
        .from('courses')
        .delete()
        .eq('id', courseId)

      if (supabaseError) throw supabaseError

      courses.value = courses.value.filter(c => c.id !== courseId)
      if (currentCourse.value && currentCourse.value.id === courseId) {
        currentCourse.value = null
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    courses,
    currentCourse,
    loading,
    error,
    publishedCourses,
    featuredCourses,
    fetchCourses,
    fetchCourseBySlug,
    createCourse,
    updateCourse,
    deleteCourse,
  }
})