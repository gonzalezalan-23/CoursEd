-- ============================================================
-- CHECK CONSTRAINTS - Course Marketplace
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- #59: profiles.role CHECK constraint
-- Evita que se inserten roles inválidos
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('student', 'instructor', 'admin'));

-- #60: courses.price CHECK constraint
-- Evita precios negativos
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_price_check;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_price_check CHECK (price >= 0);

-- #61: lessons.lesson_type CHECK constraint (actualizado con 'text')
ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_type_check;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_type_check CHECK (lesson_type IN ('video', 'pdf', 'quiz', 'text'));
