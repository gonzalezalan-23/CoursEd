import { ref } from 'vue'

const toasts = ref([])
let toastId = 0

export function useToast() {
  function addToast(options = {}) {
    const id = ++toastId
    const toast = {
      id,
      message: options.message || '',
      type: options.type || 'info', // 'success' | 'error' | 'warning' | 'info'
      duration: options.duration || 3000,
    }
    toasts.value.push(toast)

    if (toast.duration > 0) {
      setTimeout(() => removeToast(id), toast.duration)
    }

    return id
  }

  function removeToast(id) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  function success(message, options = {}) {
    return addToast({ message, type: 'success', ...options })
  }

  function error(message, options = {}) {
    return addToast({ message, type: 'error', duration: 5000, ...options })
  }

  function warning(message, options = {}) {
    return addToast({ message, type: 'warning', ...options })
  }

  function info(message, options = {}) {
    return addToast({ message, type: 'info', ...options })
  }

  return { toasts, addToast, removeToast, success, error, warning, info }
}
