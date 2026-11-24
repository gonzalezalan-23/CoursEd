<script setup>
import { watch, onUnmounted } from 'vue'
import { useConfirm } from '@/composables/useConfirm'

const { isOpen, title, message, confirmText, cancelText, variant, onConfirm, onCancel } = useConfirm()

function handleKeydown(e) {
  if (e.key === 'Escape' && isOpen.value) {
    e.stopPropagation()
    onCancel()
  }
}

watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('keydown', handleKeydown, true)
  } else {
    document.removeEventListener('keydown', handleKeydown, true)
  }
})

// BUG-L12: Remove the listener if the component unmounts while the modal is open
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown, true)
})

const variantClasses = {
  danger: 'border-error/30 bg-error/10 text-error',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  info: 'border-primary/30 bg-primary/10 text-primary-light',
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <!-- BUG-L11: ARIA dialog attributes -->
      <div v-if="isOpen" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" @click.self="onCancel">
        <div class="w-full max-w-md rounded-2xl border border-surface-lighter bg-surface p-6 shadow-2xl">
          <div class="flex items-start gap-4">
            <div :class="['flex h-10 w-10 shrink-0 items-center justify-center rounded-full', variantClasses[variant]]">
              <svg v-if="variant === 'danger'" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <svg v-else-if="variant === 'warning'" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
            </div>
            <div class="flex-1">
              <h3 id="confirm-modal-title" class="text-lg font-semibold text-text-primary">{{ title }}</h3>
              <p v-if="message" class="mt-2 text-sm text-text-secondary">{{ message }}</p>
            </div>
          </div>
          <div class="mt-6 flex justify-end gap-3">
            <button @click="onCancel" class="rounded-lg border border-surface-lighter px-4 py-2 text-sm text-text-secondary transition hover:border-primary/30 hover:text-text-primary">
              {{ cancelText }}
            </button>
            <button @click="onConfirm" :class="['rounded-lg px-4 py-2 text-sm font-semibold text-white transition', variant === 'danger' ? 'bg-error hover:bg-error/90' : variant === 'warning' ? 'bg-warning hover:bg-warning/90' : 'bg-primary hover:bg-primary/90']">
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
