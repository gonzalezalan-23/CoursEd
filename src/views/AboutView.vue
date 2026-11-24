<template>
  <div class="min-h-screen bg-surface text-slate-100">
    <!-- Hero -->
    <section class="relative overflow-hidden px-6 py-20">
      <div class="pointer-events-none absolute inset-0">
        <div class="absolute -left-24 top-0 h-64 w-64 rounded-full bg-indigo-600/10 blur-[100px]" />
        <div class="absolute -right-24 bottom-0 h-64 w-64 rounded-full bg-cyan-500/10 blur-[100px]" />
      </div>
      <div class="relative mx-auto max-w-4xl text-center">
        <h1 class="text-4xl font-extrabold leading-tight sm:text-5xl">
          Aprende y enseña
          <span class="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">sin límites.</span>
        </h1>
        <p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
          CoursEd es una plataforma de cursos online diseñada para que cualquiera pueda compartir su conocimiento y acceder a educación de calidad a precio justo.
        </p>
      </div>
    </section>

    <!-- Mission -->
    <section class="px-6 py-16">
      <div class="mx-auto max-w-5xl">
        <div class="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <p class="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-400">Nuestra misión</p>
            <h2 class="mt-3 text-3xl font-extrabold text-white">Democratizar la educación online.</h2>
            <p class="mt-4 leading-7 text-slate-400">
              Creemos que el conocimiento no debería tener barreras. Por eso creamos una plataforma donde cualquier persona puede crear cursos y monetizar su experiencia, mientras los estudiantes acceden a contenido de calidad con precios transparentes y descuentos reales según su plan.
            </p>
            <p class="mt-4 leading-7 text-slate-400">
              A diferencia de otros marketplaces, en CoursEd los instructores VIP no pagan comisión por ventas, y los estudiantes reciben descuentos proporcionales a su membresía. Nadie se queda afuera.
            </p>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center">
              <span class="text-3xl font-extrabold text-white">0%</span>
              <p class="mt-2 text-sm text-slate-400">Comisión para instructores VIP</p>
            </div>
            <div class="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center">
              <span class="text-3xl font-extrabold text-white">50%</span>
              <p class="mt-2 text-sm text-slate-400">Descuento máximo para estudiantes VIP</p>
            </div>
            <div class="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center">
              <span class="text-3xl font-extrabold text-white">ARS</span>
              <p class="mt-2 text-sm text-slate-400">Pagos en pesos argentinos</p>
            </div>
            <div class="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center">
              <span class="text-3xl font-extrabold text-white">100%</span>
              <p class="mt-2 text-sm text-slate-400">Transparente y seguro</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section class="border-y border-slate-800 bg-slate-900/30 px-6 py-16">
      <div class="mx-auto max-w-5xl">
        <h2 class="text-center text-3xl font-extrabold text-white">¿Cómo funciona?</h2>
        <div class="mt-12 grid gap-8 sm:grid-cols-3">
          <div class="text-center">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 text-2xl">1</div>
            <h3 class="mt-4 text-lg font-bold text-white">Creá tu cuenta</h3>
            <p class="mt-2 text-sm text-slate-400">Registrate gratis en segundos y elegí el plan que mejor se adapte a tus necesidades.</p>
          </div>
          <div class="text-center">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 text-2xl">2</div>
            <h3 class="mt-4 text-lg font-bold text-white">Explorá o creá cursos</h3>
            <p class="mt-2 text-sm text-slate-400">Comprá cursos del catálogo o, si sos instructor, publicá tus propios cursos con nuestras herramientas de creación.</p>
          </div>
          <div class="text-center">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 text-2xl">3</div>
            <h3 class="mt-4 text-lg font-bold text-white">Aprendé a tu ritmo</h3>
            <p class="mt-2 text-sm text-slate-400">Accedé al contenido desde cualquier dispositivo, seguí tu progreso y obtené tu certificado al completar.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Tech stack -->
    <section class="px-6 py-16">
      <div class="mx-auto max-w-4xl text-center">
        <p class="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-400">Tecnología</p>
        <h2 class="mt-3 text-3xl font-extrabold text-white">Construido con tecnología moderna.</h2>
        <p class="mx-auto mt-4 max-w-xl text-slate-400">
          CoursEd está desarrollado con las últimas tecnologías web para ofrecer una experiencia rápida, segura y confiable.
        </p>
        <div class="mt-10 flex flex-wrap justify-center gap-4">
          <span v-for="tech in techs" :key="tech" class="rounded-full border border-slate-800 bg-slate-900/50 px-5 py-2 text-sm font-medium text-slate-300">
            {{ tech }}
          </span>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="px-6 pb-20">
      <div class="mx-auto max-w-4xl rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-900/30 via-slate-900 to-purple-900/30 p-10 text-center sm:p-14">
        <h2 class="text-2xl font-bold text-white sm:text-3xl">¿Listo para empezar?</h2>
        <p class="mx-auto mt-3 max-w-md text-slate-400">
          Unite a nuestra comunidad de instructores y estudiantes. Creá tu cuenta gratis y empezá hoy.
        </p>
        <div class="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <RouterLink to="/register" class="w-full sm:w-auto rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:opacity-90">
            Crear cuenta gratis
          </RouterLink>
          <RouterLink to="/courses" class="w-full sm:w-auto rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition-all hover:border-slate-500 hover:text-white">
            Explorar cursos
          </RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { RouterLink } from 'vue-router'

const techs = ['Vue 3', 'Vite', 'Supabase', 'Tailwind CSS', 'Mercado Pago', 'Pinia']
</script>
