-- Agregar 'text' al CHECK constraint de lesson_type
-- Primero drop el constraint viejo, luego crear el nuevo
ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons.lesson_type_check;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_type_check CHECK (lesson_type IN ('video', 'pdf', 'quiz', 'text'));
