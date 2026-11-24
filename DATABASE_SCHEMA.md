# Diseño de Base de Datos - Course Marketplace

Este documento documenta el esquema completo de la base de datos para el marketplace de cursos online.

## Índice

1. Extensiones y Tipos Enumerados
2. Tabla de Categorías
3. Tabla de Membresías
4. Tabla de Perfiles de Usuario
5. Tabla de Cursos
6. Tabla de Módulos
7. Tabla de Lecciones
8. Tabla de Inscripciones
9. Tabla de Progreso de Lecciones
10. Tabla de Reseñas
11. Tabla de Mensajes de Contacto
12. Tabla de Chunks de Cursos (Embeddings)
13. Índices de Rendimiento
14. Triggers y Funciones Automáticas
15. Seguridad RLS

---

## 1. Extensiones y Tipos Enumerados

```sql
CREATE TYPE course_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE video_provider AS ENUM ('youtube', 'vimeo', 'custom');
CREATE TYPE enrollment_status AS ENUM ('active', 'completed', 'refunded', 'cancelled');
```

---

## 2. Tabla de Categorías (`public.categories`)

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | NO | PK |
| `name` | VARCHAR | NO | Nombre de la categoría |
| `slug` | VARCHAR | NO | URL amigable único |
| `description` | TEXT | SÍ | Descripción |
| `created_at` | TIMESTAMPTZ | NO | Timestamp de creación |
| `icon` | TEXT | SÍ | Icono de la categoría |
| `color` | TEXT | SÍ | Color representativo |
| `sort_order` | INT | SÍ | Orden de presentación |

---

## 3. Tabla de Membresías (`public.memberships`)

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | NO | PK |
| `name` | VARCHAR | NO | Nombre (`Básico`, `Pro`, `VIP`) |
| `description` | TEXT | SÍ | Descripción |
| `price` | NUMERIC | NO | Precio mensual |
| `currency` | VARCHAR | NO | ISO 4217 |
| `discount_percentage` | NUMERIC | NO | Dcto. para estudiantes |
| `max_courses_allowed` | INT | NO | Cursos que puede crear |
| `max_students_per_course` | INT | SÍ | `NULL` = ilimitado |
| `commission_percentage` | NUMERIC | NO | % comisión plataforma |
| `created_at` | TIMESTAMPTZ | NO | Timestamp de creación |
| `updated_at` | TIMESTAMPTZ | NO | Última actualización |

**Datos iniciales:**
```sql
INSERT INTO public.memberships (name, price, currency, discount_percentage, max_courses_allowed, max_students_per_course, commission_percentage) VALUES
('Básico', 0.00, 'ARS', 0.00, 2, 50, 20.00),
('Pro',   29.99, 'ARS', 10.00, 10, 500, 10.00),
('VIP',   79.99, 'ARS', 20.00, 9999, NULL, 5.00);
```

---

## 4. Tabla de Perfiles de Usuario (`public.profiles`)

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | NO | PK, FK a `auth.users(id)` |
| `full_name` | VARCHAR | SÍ | Nombre completo |
| `avatar_url` | TEXT | SÍ | URL de avatar |
| `bio` | TEXT | SÍ | Biografía |
| `role` | VARCHAR | NO | `student` / `instructor` / `admin` |
| `membership_id` | UUID | SÍ | FK a `memberships(id)` |
| `membership_expires_at` | TIMESTAMPTZ | SÍ | Expiración de membresía |
| `created_at` | TIMESTAMPTZ | NO | Timestamp de creación |
| `updated_at` | TIMESTAMPTZ | NO | Última actualización |
| `mp_access_token` | TEXT | SÍ | Token MercadoPago (solo instructores) |
| `mp_user_id` | TEXT | SÍ | ID de usuario en MercadoPago |

**Relaciones:**
- Muchos-a-uno con `memberships`
- Uno-a-uno con `auth.users`

---

## 5. Tabla de Cursos (`public.courses`)

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | NO | PK |
| `instructor_id` | UUID | NO | FK a `profiles(id)` |
| `title` | VARCHAR | NO | Título del curso |
| `slug` | VARCHAR | NO | URL amigable único |
| `description` | TEXT | SÍ | Descripción |
| `thumbnail_url` | TEXT | SÍ | Imagen de portada |
| `price` | NUMERIC | NO | Precio |
| `currency` | VARCHAR | NO | ISO currency |
| `status` | course_status | NO | Estado del curso |
| `created_at` | TIMESTAMPTZ | NO | Timestamp de creación |
| `updated_at` | TIMESTAMPTZ | NO | Última actualización |
| `demo_video_url` | TEXT | SÍ | URL del video demo |
| `level` | course_level | SÍ | `beginner` / `intermediate` / `advanced` |
| `category_id` | UUID | SÍ | FK a `categories(id)` |
| `language` | VARCHAR | SÍ | Idioma (`es`, `en`, `pt`, `fr`) |
| `requirements` | TEXT | SÍ | Requisitos previos |
| `objectives` | TEXT | SÍ | Objetivos de aprendizaje |
| `is_featured` | BOOLEAN | SÍ | Curso destacado |

**Relaciones:**
- Muchos-a-uno con `profiles` (instructor)
- Muchos-a-uno con `categories`
- Uno-a-muchos con `modules`
- Uno-a-muchos con `enrollments`

---

## 6. Tabla de Módulos (`public.modules`)

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | NO | PK |
| `course_id` | UUID | NO | FK a `courses(id)` |
| `title` | VARCHAR | NO | Título del módulo |
| `description` | TEXT | SÍ | Descripción |
| `order_index` | INT | NO | Orden de presentación |
| `created_at` | TIMESTAMPTZ | NO | Timestamp de creación |
| `updated_at` | TIMESTAMPTZ | NO | Última actualización |

---

## 7. Tabla de Lecciones (`public.lessons`)

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | NO | PK |
| `module_id` | UUID | NO | FK a `modules(id)` |
| `course_id` | UUID | NO | FK a `courses(id)` |
| `title` | VARCHAR | NO | Título de la lección |
| `description` | TEXT | SÍ | Descripción |
| `video_provider` | video_provider | NO | Proveedor de video |
| `video_url` | TEXT | NO | URL del video |
| `duration_seconds` | INT | SÍ | Duración en segundos |
| `is_free_preview` | BOOLEAN | NO | Vista previa gratuita |
| `order_index` | INT | NO | Orden dentro del módulo |
| `created_at` | TIMESTAMPTZ | NO | Timestamp de creación |
| `updated_at` | TIMESTAMPTZ | NO | Última actualización |
| `lesson_type` | TEXT | NO | `video` / `pdf` / `quiz` / `text` |
| `pdf_url` | TEXT | SÍ | URL del PDF |
| `quiz` | JSONB | SÍ | Datos del quiz |
| `text_content` | TEXT | SÍ | Contenido de texto |
| `search_vector` | tsvector | SÍ | Vector de búsqueda full-text |

**CHECK constraint:**
```sql
ALTER TABLE public.lessons ADD CONSTRAINT lessons_type_check
  CHECK (lesson_type IN ('video', 'pdf', 'quiz', 'text'));
```

---

## 8. Tabla de Inscripciones (`public.enrollments`)

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | NO | PK |
| `user_id` | UUID | NO | FK a `profiles(id)` |
| `course_id` | UUID | NO | FK a `courses(id)` |
| `amount_paid` | NUMERIC | NO | Monto pagado |
| `commission_fee` | NUMERIC | NO | Comisión plataforma |
| `status` | enrollment_status | NO | Estado |
| `enrolled_at` | TIMESTAMPTZ | NO | Fecha de inscripción |
| `updated_at` | TIMESTAMPTZ | NO | Última actualización |

**Constraints:**
- UNIQUE `(user_id, course_id)` — evita duplicados
- FK con cascada ON DELETE

---

## 9. Tabla de Progreso de Lecciones (`public.lesson_progress`)

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | NO | PK |
| `user_id` | UUID | NO | FK a `profiles(id)` |
| `lesson_id` | UUID | NO | FK a `lessons(id)` |
| `course_id` | UUID | NO | FK a `courses(id)` |
| `completed` | BOOLEAN | NO | Lección completada |
| `completed_at` | TIMESTAMPTZ | SÍ | Fecha de completado |
| `created_at` | TIMESTAMPTZ | NO | Timestamp de creación |

**Constraints:**
- UNIQUE `(user_id, lesson_id)` — evita duplicados

---

## 10. Tabla de Reseñas (`public.reviews`)

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | NO | PK |

*(Estructura incompleta — solo existe la tabla con la PK)*

---

## 11. Tabla de Mensajes de Contacto (`public.contact_messages`)

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | NO | PK |
| `name` | TEXT | NO | Nombre del remitente |
| `email` | TEXT | NO | Email del remitente |
| `subject` | TEXT | NO | Asunto |
| `message` | TEXT | NO | Mensaje |
| `created_at` | TIMESTAMPTZ | SÍ | Timestamp de creación |

---

## 12. Tabla de Chunks de Cursos (`public.course_chunks`)

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | NO | PK |
| `course_id` | UUID | SÍ | FK a `courses(id)` |
| `lesson_id` | UUID | SÍ | FK a `lessons(id)` |
| `chunk_text` | TEXT | NO | Texto del chunk |
| `embedding` | USER-DEFINED | SÍ | Vector de embeddings (pgvector) |
| `created_at` | TIMESTAMPTZ | SÍ | Timestamp de creación |

---

## 13. Índices de Rendimiento

```sql
-- Perfiles
CREATE INDEX idx_profiles_membership ON public.profiles(membership_id);

-- Cursos
CREATE INDEX idx_courses_instructor ON public.courses(instructor_id);
CREATE INDEX idx_courses_status ON public.courses(status);
CREATE INDEX idx_courses_category ON public.courses(category_id);

-- Módulos
CREATE INDEX idx_modules_course ON public.modules(course_id, order_index);

-- Lecciones
CREATE INDEX idx_lessons_module ON public.lessons(module_id, order_index);
CREATE INDEX idx_lessons_course ON public.lessons(course_id);

-- Inscripciones
CREATE INDEX idx_enrollments_user_course ON public.enrollments(user_id, course_id);

-- Progreso
CREATE INDEX idx_lesson_progress_user ON public.lesson_progress(user_id);
CREATE INDEX idx_lesson_progress_lesson ON public.lesson_progress(lesson_id);

-- Chunks (embeddings)
CREATE INDEX idx_course_chunks_course ON public.course_chunks(course_id);
CREATE INDEX idx_course_chunks_lesson ON public.course_chunks(lesson_id);
```

---

## 14. Triggers y Funciones Automáticas

### 14.1 Función para actualizar `updated_at`
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = timezone('utc'::text, now());
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 14.2 Trigger para crear perfil al registrar usuario
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    default_membership_id UUID;
BEGIN
    SELECT id INTO default_membership_id FROM public.memberships WHERE name = 'Básico' LIMIT 1;

    INSERT INTO public.profiles (id, full_name, avatar_url, membership_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.raw_user_meta_data->>'avatar_url',
        default_membership_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 15. Seguridad RLS

### Políticas de Lectura (SELECT)

**Membresías:**
```sql
CREATE POLICY "Membresías visibles para todos" ON public.memberships FOR SELECT USING (true);
```

**Perfiles:**
```sql
CREATE POLICY "Perfiles visibles públicamente" ON public.profiles FOR SELECT USING (true);
```

**Cursos:**
```sql
CREATE POLICY "Cursos publicados visibles para todos" ON public.courses
  FOR SELECT USING (status = 'published' OR auth.uid() = instructor_id);
```

**Módulos:**
```sql
CREATE POLICY "Módulos visibles para todos" ON public.modules FOR SELECT USING (true);
```

**Lecciones:**
```sql
CREATE POLICY "Lecciones visibles para inscritos o instructores" ON public.lessons FOR SELECT USING (
    is_free_preview = true
    OR auth.uid() IN (SELECT instructor_id FROM public.courses WHERE id = course_id)
    OR EXISTS (
        SELECT 1 FROM public.enrollments
        WHERE user_id = auth.uid() AND course_id = lessons.course_id AND status = 'active'
    )
);
```

**Inscripciones:**
```sql
CREATE POLICY "Estudiantes ven sus inscripciones" ON public.enrollments
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() IN (SELECT instructor_id FROM public.courses WHERE id = course_id));
```

**Progreso de lecciones:**
```sql
CREATE POLICY "Usuarios ven su propio progreso" ON public.lesson_progress
  FOR SELECT USING (auth.uid() = user_id);
```

**Mensajes de contacto:**
```sql
-- Solo INSERT para usuarios autenticados (el edge function usa service_role)
```

### Políticas de Escritura (INSERT/UPDATE/DELETE)

*Pendiente de implementar — ver item #2 de la lista de mejoras.*

---

## Resumen

### Tablas: 11
`categories`, `memberships`, `profiles`, `courses`, `modules`, `lessons`, `enrollments`, `lesson_progress`, `reviews`, `contact_messages`, `course_chunks`

### Relaciones principales:
```
auth.users → profiles (1:1)
profiles → memberships (N:1)
courses → profiles (N:1, instructor)
courses → categories (N:1)
modules → courses (N:1)
lessons → modules (N:1)
lessons → courses (N:1)
enrollments → profiles + courses (N:1 cada uno)
lesson_progress → profiles + lessons (N:1 cada uno)
course_chunks → courses + lessons (N:1 cada uno)
```
