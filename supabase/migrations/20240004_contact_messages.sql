-- Tabla para mensajes del formulario de contacto
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(255) NOT NULL,
  subject    VARCHAR(50) NOT NULL DEFAULT 'general',
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Solo service_role puede insertar (la edge function usa service_role key)
CREATE POLICY "Service role inserta mensajes"
  ON public.contact_messages FOR INSERT
  WITH CHECK (true);

-- Admins pueden leer mensajes (futuro panel admin)
CREATE POLICY "Admins leen mensajes"
  ON public.contact_messages FOR SELECT
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));
