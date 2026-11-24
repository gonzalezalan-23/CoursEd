import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/courses',
    name: 'Courses',
    component: () => import('@/views/CoursesView.vue'),
  },
  {
    path: '/instructors',
    name: 'Instructors',
    component: () => import('@/views/InstructorsView.vue'),
  },
  {
    path: '/courses/new',
    name: 'CourseNew',
    component: () => import('@/views/CourseFormView.vue'),
    meta: { requiresAuth: true, requiresInstructor: true },
  },
  {
    path: '/courses/:slug',
    name: 'CourseDetail',
    component: () => import('@/views/CourseDetailView.vue'),
    props: true,
  },
  {
    path: '/courses/:slug/edit',
    name: 'CourseEdit',
    component: () => import('@/views/CourseFormView.vue'),
    meta: { requiresAuth: true, requiresInstructor: true },
  },
  {
    path: '/courses/:slug/content',
    name: 'CourseContent',
    component: () => import('@/views/CourseContentView.vue'),
    meta: { requiresAuth: true, requiresInstructor: true },
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/LoginView.vue'),
  },
  {
    path: '/instructors/:id',
    name: 'Instructor',
    component: () => import('@/views/InstructorView.vue'),
  },
  {
    path: '/contact',
    name: 'Contact',
    component: () => import('@/views/ContactView.vue'),
  },
  {
    path: '/terms',
    name: 'Terms',
    component: () => import('@/views/TermsView.vue'),
  },
  {
    path: '/about',
    name: 'About',
    component: () => import('@/views/AboutView.vue'),
  },
  {
    path: '/pricing',
    name: 'Pricing',
    component: () => import('@/views/PricingView.vue'),
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('@/views/ProfileView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/mp/callback',
    name: 'MpCallback',
    component: () => import('@/views/MpCallbackView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/payment/success',
    name: 'PaymentSuccess',
    component: () => import('@/views/PaymentResultView.vue'),
  },
  {
    path: '/payment/failure',
    name: 'PaymentFailure',
    component: () => import('@/views/PaymentResultView.vue'),
  },
  {
    path: '/payment/pending',
    name: 'PaymentPending',
    component: () => import('@/views/PaymentResultView.vue'),
  },
  {
    path: '/learn/:courseId/lesson/:lessonId',
    name: 'Lesson',
    component: () => import('@/views/LessonView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFoundView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

import { supabase } from '@/services/supabase'

router.beforeEach(async (to) => {
  const { data: { session } } = await supabase.auth.getSession()

  // Redirect logged-in users away from login/register
  if ((to.name === 'Login' || to.name === 'Register') && session) {
    return { name: 'Dashboard' }
  }

  if (to.meta.requiresAuth) {
    if (!session) {
      return { name: 'Login', query: { redirect: to.fullPath } }
    }
  }

  if (to.meta.requiresInstructor) {
    if (!session) return { name: 'Login', query: { redirect: to.fullPath } }

    const auth = useAuthStore()
    // BUG-M01: Ensure auth store is fully initialized (user + profile) before checking roles.
    // initialize() is idempotent (guarded by `initialized` flag).
    await auth.initialize()
    if (!auth.profile) {
      await auth.fetchProfile()
    }

    const role = auth.profile?.role
    const membershipName = auth.profile?.memberships?.name
    const allowed = role && (['instructor', 'admin'].includes(role) || ['Pro', 'VIP'].includes(membershipName))
    if (!allowed) {
      return { name: 'Dashboard' }
    }
  }
})

export default router
