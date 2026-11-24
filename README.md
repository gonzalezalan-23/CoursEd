# CoursEd

Plataforma de cursos online con membresías, pagos y panel de instructor. Proyecto integrador de tecnicatura.

## Stack

- **Frontend:** Vue 3 + Vite + Tailwind CSS 4
- **Backend / DB:** Supabase (PostgreSQL + Auth + Edge Functions)
- **Pagos:** Mercado Pago Checkout Pro
- **Deploy:** Vercel / Netlify (estático)

## Requisitos previos

- Node.js 18 o superior
- Una cuenta en [Supabase](https://supabase.com) con el proyecto configurado
- (Opcional) Cuenta de Mercado Pago en modo sandbox para probar pagos

## Instalación local

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/coursed.git
cd coursed/Sistema

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Supabase y Mercado Pago

# 4. Iniciar el servidor de desarrollo
npm run dev
```

La app queda disponible en `http://localhost:5173`.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave anon pública de Supabase |
| `VITE_MP_PUBLIC_KEY` | Clave pública de Mercado Pago (sandbox o producción) |
| `VITE_MP_REDIRECT_URI` | URI de callback de Mercado Pago |

Las variables sin prefijo `VITE_` (`MP_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) se configuran como **secrets en Supabase** para las Edge Functions. Nunca se exponen al cliente.

## Scripts disponibles

```bash
npm run dev       # Servidor de desarrollo con hot-reload
npm run build     # Build de producción en /dist
npm run preview   # Previsualizar el build de producción localmente
```

## Estructura del proyecto

```
src/
├── components/     # Componentes reutilizables (NavBar, CourseCard, ChatBot…)
├── composables/    # useToast, useConfirm
├── router/         # Rutas y guards de autenticación
├── services/       # courseService.js, supabase.js
├── stores/         # Pinia: auth.js, courses.js
├── utils/          # format.js
└── views/          # Una vista por ruta
supabase/
├── functions/      # Edge Functions (create-payment, chat-faq…)
└── migrations/     # Migraciones SQL
```

## Funcionalidades principales

- Catálogo de cursos con búsqueda, filtros y paginación
- Detalle de curso con currículum, instructor y precio con descuento por membresía
- Registro e inicio de sesión con Supabase Auth
- Planes de membresía (Básico / Pro / VIP) con descuentos automáticos
- Pago de planes y cursos via Mercado Pago
- Panel de instructor: crear cursos, módulos y lecciones
- **Carga rápida de lecciones:** tabla editable para agregar múltiples videos en un solo guardado
- Reproductor de lecciones con soporte YouTube, Vimeo y URL personalizada
- Chat asistente (CoursBot) exclusivo para miembros Pro y VIP
- Dashboard del alumno con progreso de cursos

## Decisiones de arquitectura

**Videos por URL externa (YouTube / Vimeo / Custom)**
La plataforma no almacena archivos de video. Cada lección guarda una URL que puede apuntar a cualquier proveedor. Esta decisión permite enfocarse en la experiencia de aprendizaje (progreso, quizzes, membresías) sin asumir costos de infraestructura de video en etapa temprana. El campo `video_url` en la tabla `lessons` es agnóstico al proveedor; migrar a Cloudflare Stream o similar en una segunda etapa es un cambio de dato, no de arquitectura.

## Licencia

MIT
