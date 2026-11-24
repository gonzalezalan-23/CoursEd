-- Fix lesson_progress RLS: drop conflicting policies, create unified one
-- Las migraciones anteriores crearon políticas separadas que causan 403

-- Drop all existing policies on lesson_progress
DROP POLICY IF EXISTS "Usuarios ven su propio progreso" ON public.lesson_progress;
DROP POLICY IF EXISTS "Usuarios insertan su propio progreso" ON public.lesson_progress;
DROP POLICY IF EXISTS "Usuarios actualizan su propio progreso" ON public.lesson_progress;
DROP POLICY IF EXISTS "Users manage own progress" ON public.lesson_progress;

-- Single unified policy for all operations
CREATE POLICY "Users manage own lesson progress"
  ON public.lesson_progress
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
