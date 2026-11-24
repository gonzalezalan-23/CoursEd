<script setup>
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import NavBar from '@/components/NavBar.vue'
import Footer from '@/components/Footer.vue'
import ChatBot from '@/components/ChatBot.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import ToastContainer from '@/components/ToastContainer.vue'

const authStore = useAuthStore()

onMounted(() => {
  authStore.initialize().catch(err => console.error('Auth init failed:', err))
})
</script>

<template>
  <div class="min-h-screen bg-surface" style="--header-height:64px">
    <NavBar />
    <main>
      <RouterView />
    </main>
    <Footer />
    <ChatBot />
    <ConfirmModal />
    <ToastContainer />
  </div>
</template>
