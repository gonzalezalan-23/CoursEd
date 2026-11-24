import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/services/supabase'
import { useToast } from '@/composables/useToast'

export const useAuthStore = defineStore('auth', () => {
  // --- State ---
  const user = ref(null)
  const profile = ref(null)
  const membership = ref(null)
  const loading = ref(true)
  const quizActive = ref(false) // true when user is on a quiz lesson

  // --- Getters ---
  const isAuthenticated = computed(() => !!user.value)
  const membershipName = computed(() => membership.value?.name ?? 'Básico')
  const membershipDiscount = computed(() => parseFloat(membership.value?.discount_percentage ?? 0))
  const isInstructor = computed(() => {
    const role = profile.value?.role
    const mem = membership.value?.name
    return role === 'instructor' || role === 'admin' || ['Pro', 'VIP'].includes(mem)
  })
  const hasChatAccess = computed(() => ['Pro', 'VIP'].includes(membership.value?.name))

  // --- Actions ---

  async function fetchProfile() {
    if (!user.value) return

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, memberships(*)')
        .eq('id', user.value.id)
        .single()

      if (!error && data) {
        delete data.mp_access_token
        profile.value = data
        membership.value = data.memberships
      } else {
        profile.value = null
        membership.value = null
      }
    } catch (err) {
      console.error('Error fetching profile:', err)
      profile.value = null
      membership.value = null
    }
  }

  let authListener = null
  let initialized = false

  async function initialize() {
    if (initialized) return
    initialized = true
    loading.value = true

    const { data: { session } } = await supabase.auth.getSession()
    user.value = session?.user ?? null

    if (user.value) {
      await fetchProfile()
    }

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      user.value = session?.user ?? null
      if (user.value) {
        await fetchProfile()
      } else {
        profile.value = null
        membership.value = null
      }
    })
    authListener = subscription

    loading.value = false
  }

  async function signInWithEmail(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signUpWithEmail(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })
    if (error) throw error
    return data
  }

  async function signOut() {
    // BUG-L13: Only clear state + navigate when signOut succeeds; keep the auth listener alive on failure
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error

      authListener?.unsubscribe()
      authListener = null
      user.value = null
      profile.value = null
      membership.value = null

      window.location.href = '/'
    } catch (err) {
      console.error('Error al cerrar sesión:', err)
      useToast().error('No se pudo cerrar sesión. Intentá de nuevo.')
    }
  }

  function dispose() {
    authListener?.unsubscribe()
    authListener = null
  }


  return {
    user,
    profile,
    membership,
    loading,
    quizActive,
    isAuthenticated,
    isInstructor,
    hasChatAccess,
    membershipName,
    membershipDiscount,
    initialize,
    fetchProfile,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    dispose,
  }
})
