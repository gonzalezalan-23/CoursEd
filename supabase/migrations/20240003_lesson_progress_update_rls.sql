-- Agregar política UPDATE para lesson_progress (necesaria para upsert)
CREATE POLICY "Usuarios actualizan su propio progreso"
  ON public.lesson_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
