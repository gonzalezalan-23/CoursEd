/**
 * Course Service — Capa de servicio/controlador para consultas de cursos
 * Encapsula toda la lógica de acceso a datos de Supabase
 * independiente de los componentes Vue.
 */
import { supabase } from '@/services/supabase'

/**
 * Obtiene la lista completa de cursos publicados con datos del instructor.
 * @param {Object} options - Opciones de filtrado y paginación
 * @param {string} [options.search] - Término de búsqueda por título/descripción
 * @param {string} [options.sortBy] - Campo de ordenamiento ('created_at' | 'price' | 'title')
 * @param {boolean} [options.ascending] - Orden ascendente (default: false)
 * @param {number} [options.limit] - Cantidad máxima de resultados
 * @param {number} [options.offset] - Offset para paginación
 * @returns {Promise<{ data: Array, count: number, error: string|null }>}
 */
export async function getPublishedCourses({
  search = '',
  sortBy = 'created_at',
  ascending = false,
  limit = 20,
  offset = 0,
  categoryId = null,
  level = null,
} = {}) {
  try {
    const allowedSorts = ['created_at', 'price', 'title']
    const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'created_at'
    const safeLimit = Math.max(1, Math.min(100, limit))
    const safeOffset = Math.max(0, offset)

    let query = supabase
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
        profiles:instructor_id (
          id,
          full_name,
          avatar_url
        ),
        modules (
          id,
          lessons ( duration_seconds )
        )
      `, { count: 'exact' })
      .eq('status', 'published')
      .order(safeSortBy, { ascending })
      .range(safeOffset, safeOffset + safeLimit - 1)

    // Búsqueda por título o descripción (PostgREST no soporta columnas de tablas joined en or())
    let instructorIds = []
    if (search.trim()) {
      const safeSearch = search.replace(/[%_]/g, m => '\\' + m)

      // Buscar instructores por nombre
      const { data: instructorMatches } = await supabase
        .from('profiles')
        .select('id')
        .ilike('full_name', `%${safeSearch}%`)
      instructorIds = (instructorMatches || []).map(i => i.id)

      // Filter por título o descripción, O por instructor
      if (instructorIds.length > 0) {
        query = query.or(`title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%,instructor_id.in.(${instructorIds.join(',')})`)
      } else {
        query = query.or(`title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`)
      }
    }

    // Filtro por categoría
    if (categoryId) {
      query = query.eq('category_id', categoryId)
    }

    // Filtro por nivel
    if (level) {
      query = query.eq('level', level)
    }

    const { data, error, count } = await query

    if (error) {
      return { data: [], count: 0, error: error.message }
    }

    // Sort by relevance: title > description > instructor
    let sorted = data || []
    if (search.trim()) {
      const q = search.toLowerCase()
      sorted = [...sorted].sort((a, b) => {
        const aTitle = a.title?.toLowerCase().includes(q) ? 0 : 2
        const bTitle = b.title?.toLowerCase().includes(q) ? 0 : 2
        if (aTitle !== bTitle) return aTitle - bTitle
        const aDesc = a.description?.toLowerCase().includes(q) ? 0 : 1
        const bDesc = b.description?.toLowerCase().includes(q) ? 0 : 1
        return aDesc - bDesc
      })
    }

    return { data: sorted, count, error: null }
  } catch (err) {
    return { data: [], count: 0, error: err.message }
  }
}

/**
 * Obtiene un curso individual por su slug, incluyendo módulos y lecciones.
 * @param {string} slug - Slug del curso
 * @returns {Promise<{ data: Object|null, error: string|null }>}
 */
export async function getCourseBySlug(slug) {
  try {
    const { data, error } = await supabase
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
            lesson_type,
            order_index
          )
        )
      `)
      .eq('slug', slug)
      .single()

    if (error) {
      return { data: null, error: error.message }
    }

    // Ordenar módulos y lecciones por order_index
    if (data.modules) {
      data.modules = [...data.modules].sort((a, b) => a.order_index - b.order_index)
      data.modules.forEach((mod) => {
        if (mod.lessons) {
          mod.lessons = [...mod.lessons].sort((a, b) => a.order_index - b.order_index)
        }
      })
    }

    return { data, error: null }
  } catch (err) {
    return { data: null, error: err.message }
  }
}

/**
 * Verifica si el usuario actual está inscrito en un curso.
 * @param {string} courseId - ID del curso
 * @returns {Promise<boolean>}
 */
export async function isUserEnrolled(courseId) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false

  const { data, error } = await supabase
    .from('enrollments')
    .select('id')
    .eq('course_id', courseId)
    .eq('user_id', session.user.id)
    .eq('status', 'active')
    .maybeSingle()

  return !error && !!data
}

/**
 * Obtiene el número total de alumnos inscritos en un curso.
 * @param {string} courseId - ID del curso
 * @returns {Promise<number>}
 */
export async function getCourseStudentCount(courseId) {
  const { count, error } = await supabase
    .from('enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('status', 'active')

  if (error) console.warn('getCourseStudentCount error:', error)
  return error ? 0 : count
}
