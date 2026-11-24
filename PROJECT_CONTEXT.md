# Contexto del Proyecto — CoursEd

## Stack técnico
- Frontend: Vue 3 + Vite + Tailwind CSS + Pinia + Vue Router
- Backend: Supabase (PostgreSQL + Edge Functions + Auth + Storage)
- Pagos: Mercado Pago
- IA: Groq API (Qwen 3.6 27B)
- Chatbot: Edge Function `chat-faq` con full-text search (tsvector/tsquery) + historial persistente en DB
- Moneda: ARS (Pesos Argentinos)
- Despliegue: Local (Vite dev server + Cloudflare Tunnel)

## Estructura de archivos clave
```
src/
├── App.vue                    # Root — monta NavBar, RouterView, Footer, ChatBot, ConfirmModal, ToastContainer
├── components/
│   ├── ChatBot.vue            # Chat flotante VIP con anti-cheat + historial en Supabase
│   ├── ConfirmModal.vue       # Modal global con cierre por Escape
│   ├── CourseCard.vue         # Tarjeta de curso con descuento
│   ├── ToastContainer.vue     # Sistema de notificaciones toast
│   ├── Breadcrumbs.vue        # Navegación migratoria reutilizable
│   ├── Footer.vue
│   └── NavBar.vue             # Navbar responsive, brand CoursEd
├── composables/
│   ├── useConfirm.js          # Composable para modales de confirmación
│   └── useToast.js            # Composable para notificaciones toast
├── views/
│   ├── HomeView.vue           # Homepage con cursos, stats, CTA
│   ├── CoursesView.vue        # Catálogo de cursos
│   ├── CourseDetailView.vue   # Detalle de curso con video modal
│   ├── CourseFormView.vue     # Crear/editar curso (auto-save con retry)
│   ├── CourseContentView.vue  # Editor de módulos/lecciones
│   ├── LessonView.vue         # Vista de lección (video/pdf/text/quiz) + Footer + certificado descargable
│   ├── LoginView.vue
│   ├── PricingView.vue        # Planes desde DB
│   ├── ProfileView.vue
│   ├── DashboardView.vue      # Panel con paginación (9 items/página)
│   ├── PaymentResultView.vue  # Post-pago
│   ├── InstructorsView.vue
│   ├── InstructorView.vue
│   ├── AboutView.vue
│   ├── ContactView.vue        # Formulario real con Edge Function
│   └── TermsView.vue          # Términos y condiciones
├── stores/
│   ├── auth.js                # Auth + membership + quizActive
│   └── courses.js
├── services/
│   ├── supabase.js            # Cliente Supabase
│   ├── courseService.js       # Queries de cursos
│   └── paymentService.js      # Código muerto (no importado)
├── utils/
│   └── format.js              # formatCurrency
└── router/
    └── index.js               # Guards de auth + instructor

supabase/
├── functions/
│   ├── chat-faq/index.ts      # Chatbot RAG con Groq + full-text search
│   ├── create-payment/index.ts
│   ├── mp-webhook/index.ts
│   ├── mp-oauth-callback/index.ts
│   └── send-contact-message/index.ts
├── migrations/
│   ├── 20260831_enable_pgvector.sql  # tsvector + search_courses function
│   └── 20260912_chat_history.sql     # Tabla de historial del chatbot
└── config.toml
```

## Base de datos (tablas principales)
- `profiles` → id, full_name, avatar_url, bio, role, membership_id, mp_user_id
- `memberships` → id, name, price, discount_percentage, commission_percentage
- `courses` → id, instructor_id, title, slug, description, thumbnail_url, price, status, category_id, level, language, is_featured
- `modules` → id, course_id, title, description, order_index
- `lessons` → id, module_id, course_id, title, description, lesson_type (video/pdf/text/quiz), video_url, pdf_url, text_content, quiz (JSONB), is_free_preview, order_index, search_vector (tsvector)
- `enrollments` → id, user_id, course_id, amount_paid, status
- `lesson_progress` → id, user_id, lesson_id, course_id, completed_at
- `categories` → id, name, slug
- `contact_messages` → id, name, email, subject, message
- `chat_history` → id, user_id, role, content, created_at (NUEVO)

## Funcionalidades implementadas
1. **Auth**: Login/registro con Supabase Auth, guards de ruta
2. **Cursos**: CRUD completo con auto-save (retry 3 intentos), 4 tipos de lección
3. **Pagos**: Mercado Pago con webhooks, membresías, descuentos por membresía + confirmation modal
4. **Quiz**: Grading client-side (70% para aprobar), detección de cambio de pestaña
5. **Chatbot**: Groq API + historial persistente en Supabase + botón limpiar historial
6. **Contacto**: Formulario real con Edge Function + Resend email
7. **Perfiles**: Instructor profiles con avatar, bio, cursos
8. **RTL/Responsive**: Navbar mobile, sidebar toggle, sticky bars
9. **Breadcrumbs**: Navegación en LessonView, CourseDetailView, CourseContentView con loading state
10. **Modal confirmación**: Cierre con Escape, variantes danger/warning/info
11. **Toast notifications**: Sistema de notificaciones globales (success/error/warning/info)
12. **Dashboard**: Paginación (9 items/página) en ambas pestañas
13. **Certificado**: Profesional con SVG, QR verificable, firma de instructor, descarga PDF
14. **Atajos de teclado**: ← → Escape ? con modal de ayuda (cierra con Escape)
15. **Protección de navegación**: Confirmación al salir con cambios sin guardar en CourseFormView
16. **Skeleton loading**: CourseDetailView con skeleton cards mientras carga
17. **Autocomplete**: Búsqueda con 2 caracteres mínimos + debounce 300ms
18. **Pricing**: Confirmation modal antes de redirigir a Mercado Pago

## Bugs corregidos (2026-09-12)
1. Breadcrumbs ruta `/cursos` → `/courses` en LessonView.vue y CourseDetailView.vue
2. Modal de confirmación ahora cierra con Escape
3. Auto-save con retry limit (max 3) para evitar loops en errores de red
4. Breadcrumbs muestra skeleton mientras carga el curso
5. Gradient text del hero ajustado para iPhone SE (320px)
6. Footer agregado a LessonView
7. Feedback visual al cargar imagen de portada (loading/error states)
8. Autocomplete de instructores requiere mínimo 2 caracteres (antes 3)
9. CourseFormView protege contra navegación con cambios sin guardar
10. Modal de atajos cierra con Escape
11. Thumbnail loading no se activa en cada tecla (debounce)
12. Pricing muestra confirmation modal antes de redirigir a Mercado Pago

## Conocimiento de bugs conocidos
- `paymentService.js` es código muerto (no importado)
- Quiz grading es 100% client-side (bypassable)
- Currency hardcoded a ARS
- No hay rate limiting en chat-faq
- `APP_URL` CORS con trailing slash (manejo en código)

## Credenciales de prueba
- Email: vip@gmail.com (membresía VIP)
- Tunnel: https://kbc3gvmr-5173.brs.devtunnels.ms
