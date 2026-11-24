import { ref } from 'vue'

const isOpen = ref(false)
const title = ref('')
const message = ref('')
const confirmText = ref('Confirmar')
const cancelText = ref('Cancelar')
const variant = ref('danger') // 'danger' | 'warning' | 'info'
let resolvePromise = null

export function useConfirm() {
  function confirm(options = {}) {
    // BUG-M08: If a confirm is already open, resolve it with false before opening the new one
    if (resolvePromise) {
      resolvePromise(false)
      resolvePromise = null
    }

    title.value = options.title || '¿Estás seguro?'
    message.value = options.message || ''
    confirmText.value = options.confirmText || 'Confirmar'
    cancelText.value = options.cancelText || 'Cancelar'
    variant.value = options.variant || 'danger'
    isOpen.value = true

    return new Promise((resolve) => {
      resolvePromise = resolve
    })
  }

  function onConfirm() {
    isOpen.value = false
    resolvePromise?.(true)
    resolvePromise = null
  }

  function onCancel() {
    isOpen.value = false
    resolvePromise?.(false)
    resolvePromise = null
  }

  return { isOpen, title, message, confirmText, cancelText, variant, confirm, onConfirm, onCancel }
}
