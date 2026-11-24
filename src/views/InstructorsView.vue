<template>
  <div class="min-h-screen bg-surface text-slate-100 py-16">
    <div class="mx-auto max-w-5xl px-6 text-center">
      <h1 class="text-4xl font-extrabold sm:text-5xl">Empieza a enseñar en CoursEd</h1>
      <p class="mx-auto mt-4 max-w-3xl text-lg text-slate-300">
        Conviértete en instructor y monetiza tu conocimiento. Comparte tus cursos con miles de estudiantes y aprovecha herramientas para crear, publicar y promocionar tu contenido.
      </p>

      <div class="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <RouterLink v-if="isAuth && isInstructor" to="/courses/new" class="rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-6 py-3 text-white font-semibold">Crear mi curso</RouterLink>
        <RouterLink v-else-if="isAuth" to="/profile" class="rounded-xl border border-slate-700 bg-slate-900/50 px-6 py-3 text-slate-100 font-semibold">Solicitar acceso de instructor</RouterLink>
        <RouterLink v-else to="/register" class="rounded-xl border border-slate-700 bg-slate-900/50 px-6 py-3 text-slate-100 font-semibold">Regístrate y empieza a enseñar</RouterLink>
      </div>

      <div class="mt-12 grid gap-8 sm:grid-cols-2">
        <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-left">
          <h3 class="text-lg font-semibold text-slate-100">Beneficios</h3>
          <ul class="mt-3 space-y-2 text-slate-300">
            <li>Herramientas de creación fáciles de usar (módulos y lecciones).</li>
            <li>Panel de estadísticas para seguir el desempeño de tus cursos.</li>
            <!-- BUG-L05: "cupones" removed — feature doesn't exist -->
            <li>Opciones de precios y descuentos por membresía para tus alumnos.</li>
            <li>Soporte y recursos para promocionar tus cursos.</li>
          </ul>
        </div>

        <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-left">
          <h3 class="text-lg font-semibold text-slate-100">Requisitos</h3>
          <ul class="mt-3 space-y-2 text-slate-300">
            <li>Contar con una membresía activa <strong>(Pro o VIP)</strong> para publicar cursos.</li>
            <li>Tener contenido propio y cumplir las políticas de la plataforma.</li>
            <li>Verificación de identidad y datos de pago para recibir ingresos.</li>
          </ul>
        </div>
      </div>

      <div class="mt-12 text-sm text-slate-400">
        <strong>¿No estás seguro?</strong> Crea una cuenta gratuita y explora el panel. Para publicar, necesitarás actualizar a Pro o VIP.
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
const isAuth = computed(() => auth.isAuthenticated)
const isInstructor = computed(() => auth.isInstructor)
</script>
