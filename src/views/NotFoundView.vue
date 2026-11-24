<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <!-- BUG-L15: header is 64px (was calc(100vh-72px)) -->
  <div class="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center px-6 py-16 text-center">
    <div class="pointer-events-none fixed inset-0 overflow-hidden">
      <div class="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
    </div>

    <p class="relative text-8xl font-extrabold gradient-text">404</p>
    <h1 class="relative mt-4 text-2xl font-bold text-text-primary">Página no encontrada</h1>
    <p class="relative mt-3 max-w-sm text-text-muted">
      La página que buscás no existe o fue movida.
    </p>
    <div class="relative mt-8 flex gap-3">
      <RouterLink to="/" class="btn-primary px-6 py-2.5">Ir al inicio</RouterLink>
      <RouterLink to="/courses" class="rounded-lg border border-surface-lighter px-6 py-2.5 text-sm text-text-secondary transition hover:border-primary/30 hover:text-text-primary">
        Ver cursos
      </RouterLink>
    </div>
  </div>
</template>
