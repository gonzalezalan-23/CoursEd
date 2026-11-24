<template>
  <footer class="border-t border-slate-800 bg-[#07080b] text-slate-400">
    <div class="mx-auto max-w-6xl px-6 py-8">
      <div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 class="text-lg font-bold text-slate-100">CoursEd</h3>
          <p class="mt-1 text-sm text-slate-400">Aprende y enseña con herramientas modernas y pagos transparentes.</p>
        </div>

        <div class="flex gap-8">
          <div>
            <h4 class="text-sm font-semibold text-slate-200">Plataforma</h4>
            <ul class="mt-2 space-y-2 text-sm">
              <li><RouterLink to="/courses" class="hover:text-white">Cursos</RouterLink></li>
              <li><RouterLink to="/instructors" class="hover:text-white">Instructores</RouterLink></li>
              <li><RouterLink to="/pricing" class="hover:text-white">Precios</RouterLink></li>
            </ul>
          </div>

          <div>
            <h4 class="text-sm font-semibold text-slate-200">Compañía</h4>
            <ul class="mt-2 space-y-2 text-sm">
              <li><RouterLink to="/about" class="hover:text-white">Acerca</RouterLink></li>
              <li><RouterLink to="/contact" class="hover:text-white">Contacto</RouterLink></li>
              <li><RouterLink to="/terms" class="hover:text-white">Términos</RouterLink></li>
            </ul>
          </div>
        </div>
      </div>

        <div class="mt-8 border-t border-slate-800/60 pt-6 text-sm text-slate-500">
        © {{ new Date().getFullYear() }} CoursEd. Todos los derechos reservados.
      </div>
    </div>
  </footer>
</template>

<script setup>
import { RouterLink } from 'vue-router'
</script>
