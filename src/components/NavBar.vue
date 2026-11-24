<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const isMobileMenuOpen = ref(false)
const authStore = useAuthStore()
const route = useRoute()

// BUG-044: Close mobile menu on route change
watch(() => route.fullPath, () => {
  isMobileMenuOpen.value = false
})

// BUG-045: Close mobile menu on Escape key
function onKeydown(e) {
  if (e.key === 'Escape' && isMobileMenuOpen.value) {
    isMobileMenuOpen.value = false
  }
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <nav class="sticky top-0 z-50 border-b border-slate-800 bg-surface/80 px-6 py-4 backdrop-blur-md transition-all">
    <div class="mx-auto flex max-w-6xl items-center justify-between">
      
      <!-- Logo y Nombre -->
      <RouterLink to="/" class="flex items-center gap-3">
        <!-- Reemplaza este SVG por el tuyo limpio de SVGOMG -->
        <svg class="h-8 w-8 text-indigo-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
        <span class="text-xl font-extrabold tracking-tight text-slate-100">
          CoursEd
        </span>
        <!-- Membership badge (compact) -->
        <span v-if="authStore.isAuthenticated && authStore.membershipName !== 'Básico'" class="ml-3 inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">
          <svg class="h-3 w-3 text-amber-300" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l.254.78a1 1 0 0 0 .95.69h.82c.969 0 1.371 1.24.588 1.81l-.665.485a1 1 0 0 0-.364 1.118l.254.78c.3.921-.755 1.688-1.539 1.118l-.665-.485a1 1 0 0 0-1.176 0l-.665.485c-.784.57-1.838-.197-1.539-1.118l.254-.78a1 1 0 0 0-.364-1.118L3.737 6.207C2.954 5.637 3.356 4.397 4.325 4.397h.82a1 1 0 0 0 .95-.69l.254-.78z"/></svg>
          <span>{{ authStore.membershipName }}</span>
        </span>
      </RouterLink>

      <!-- Desktop Navigation (Oculto en móviles) -->
      <div class="hidden items-center gap-8 md:flex">
        <RouterLink to="/courses" class="text-sm font-medium text-slate-300 transition-colors hover:text-indigo-400">
          Cursos
        </RouterLink>
        <RouterLink v-if="!authStore.isInstructor" to="/instructors" class="text-sm font-medium text-slate-300 transition-colors hover:text-indigo-400">
          Instructores
        </RouterLink>
        <RouterLink v-if="authStore.membershipName === 'Básico'" to="/pricing" class="text-sm font-medium text-slate-300 transition-colors hover:text-indigo-400">
          Precios
        </RouterLink>

        <!-- Divisor vertical -->
        <div class="h-6 w-px bg-slate-700"></div>

        <!-- Auth Section Desktop -->
        <template v-if="authStore.isAuthenticated">
          <RouterLink v-if="authStore.isInstructor" to="/courses/new" class="text-sm font-medium text-cyan-400 transition-colors hover:text-cyan-300">
            Crear curso
          </RouterLink>
          <RouterLink to="/dashboard" class="text-sm font-medium text-slate-300 transition-colors hover:text-indigo-400">
            Dashboard
          </RouterLink>
          
          <!-- Avatar -->
          <RouterLink to="/profile" class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-indigo-500/20 ring-2 ring-indigo-500/30 transition-all hover:ring-indigo-500">
            <img v-if="authStore.profile?.avatar_url" :src="authStore.profile.avatar_url" class="h-full w-full object-cover" alt="Perfil" />
            <span v-else class="text-sm font-bold text-indigo-300">
              {{ authStore.profile?.full_name?.charAt(0)?.toUpperCase() || '?' }}
            </span>
          </RouterLink>
          
          <!-- Sign out moved to profile view/menu -->
        </template>
        
        <template v-else>
          <RouterLink to="/login" class="text-sm font-medium text-slate-300 transition-colors hover:text-white">
            Iniciar sesión
          </RouterLink>
          <RouterLink to="/register" class="rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:opacity-90 hover:shadow-indigo-500/40">
            Prueba gratis
          </RouterLink>
        </template>
      </div>

      <!-- Mobile Menu Button (Visible solo en móviles) -->
      <button 
        @click="isMobileMenuOpen = !isMobileMenuOpen" 
        :aria-label="isMobileMenuOpen ? 'Cerrar menú' : 'Menú'"
        :aria-expanded="isMobileMenuOpen"
        class="text-slate-300 transition-colors hover:text-white md:hidden"
      >
        <svg v-if="!isMobileMenuOpen" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <svg v-else class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Mobile Navigation (Dropdown) -->
    <div 
      v-if="isMobileMenuOpen" 
      class="mt-4 flex flex-col gap-4 border-t border-slate-800 pt-4 md:hidden"
      @click="isMobileMenuOpen = false"
    >
      <RouterLink to="/courses" class="text-base font-medium text-slate-300 hover:text-indigo-400">Cursos</RouterLink>
      <RouterLink v-if="!authStore.isInstructor" to="/instructors" class="text-base font-medium text-slate-300 hover:text-indigo-400">Instructores</RouterLink>
      <RouterLink v-if="authStore.membershipName === 'Básico'" to="/pricing" class="text-base font-medium text-slate-300 hover:text-indigo-400">Precios</RouterLink>

      <div class="my-2 h-px w-full bg-slate-800"></div>

      <!-- Auth Section Mobile -->
      <template v-if="authStore.isAuthenticated">
        <div class="flex items-center gap-3 pb-2">
          <div class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-indigo-500/20 ring-2 ring-indigo-500/30">
            <img v-if="authStore.profile?.avatar_url" :src="authStore.profile.avatar_url" class="h-full w-full object-cover" :alt="authStore.profile?.full_name || 'Avatar'" />
            <span v-else class="text-sm font-bold text-indigo-300">
              {{ authStore.profile?.full_name?.charAt(0)?.toUpperCase() || '?' }}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-sm font-medium text-slate-100">{{ authStore.profile?.full_name || 'Usuario' }}</span>
            <RouterLink to="/profile" class="text-xs text-slate-400 hover:text-indigo-400">Ver perfil</RouterLink>
          </div>
        </div>

        <RouterLink v-if="authStore.isInstructor" to="/courses/new" class="text-base font-medium text-cyan-400">Crear curso</RouterLink>
        <RouterLink to="/dashboard" class="text-base font-medium text-slate-300 hover:text-indigo-400">Dashboard</RouterLink>
        <!-- Sign out moved to profile view/menu -->
      </template>
      
      <template v-else>
        <RouterLink to="/login" class="text-base font-medium text-slate-300 hover:text-white">Iniciar sesión</RouterLink>
        <RouterLink to="/register" class="inline-flex justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-3 text-base font-semibold text-white">
          Prueba gratis
        </RouterLink>
      </template>
    </div>
  </nav>
</template>
