<script setup>
import { RouterLink } from 'vue-router'

defineProps({
  items: { type: Array, required: true },
})
</script>

<template>
  <nav aria-label="Breadcrumb" class="mb-4">
    <ol class="flex flex-wrap items-center gap-1.5 text-sm">
      <li v-for="(item, i) in items" :key="i" class="flex items-center gap-1.5">
        <svg v-if="i > 0" class="h-3.5 w-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        <RouterLink
          v-if="item.to && i < items.length - 1"
          :to="item.to"
          class="text-primary-light transition hover:text-primary-hover"
        >
          {{ item.label }}
        </RouterLink>
        <span v-else :class="i === items.length - 1 ? 'font-medium text-text-primary' : 'text-text-secondary'">
          {{ item.label }}
        </span>
      </li>
    </ol>
  </nav>
</template>
