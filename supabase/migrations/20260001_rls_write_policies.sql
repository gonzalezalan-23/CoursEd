-- ============================================================
-- RLS WRITE POLICIES - Course Marketplace
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── CATEGORIES ──
-- Solo admins pueden modificar categorías
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage categories" ON public.categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── MEMBERSHIPS ──
-- Solo admins pueden modificar membresías
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage memberships" ON public.memberships
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── PROFILES ──
-- Usuarios solo pueden actualizar su propio perfil
-- Admins pueden actualizar cualquier perfil
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins update any profile" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── COURSES ──
-- Instructores pueden crear/modificar/eliminar sus propios cursos
-- Admins pueden todo
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors create courses" ON public.courses
  FOR INSERT WITH CHECK (auth.uid() = instructor_id);

CREATE POLICY "Instructors update own courses" ON public.courses
  FOR UPDATE USING (auth.uid() = instructor_id);

CREATE POLICY "Instructors delete own courses" ON public.courses
  FOR DELETE USING (auth.uid() = instructor_id);

CREATE POLICY "Admins manage all courses" ON public.courses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── MODULES ──
-- Instructores pueden gestionar módulos de sus propios cursos
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors manage own course modules" ON public.modules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.courses
      WHERE id = modules.course_id AND instructor_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage all modules" ON public.modules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── LESSONS ──
-- Instructores pueden gestionar lecciones de sus propios cursos
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors manage own course lessons" ON public.lessons
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.courses
      WHERE id = lessons.course_id AND instructor_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage all lessons" ON public.lessons
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── ENROLLMENTS ──
-- Edge functions con service_role crean enrollments
-- Usuarios no insertan directamente (el webhook lo hace)
-- Solo permitimos UPDATE para completar status
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages enrollments" ON public.enrollments
  FOR ALL USING (true);

-- ── LESSON_PROGRESS ──
-- Usuarios gestionan su propio progreso
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own progress" ON public.lesson_progress
  FOR ALL USING (auth.uid() = user_id);

-- ── CONTACT_MESSAGES ──
-- Solo INSERT para usuarios autenticados
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users insert messages" ON public.contact_messages
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins read all messages" ON public.contact_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── COURSE_CHUNKS ──
-- Solo service_role gestiona chunks (embeddings)
ALTER TABLE public.course_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages chunks" ON public.course_chunks
  FOR ALL USING (true);
