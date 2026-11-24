-- 20261012_fix_missing_table_grants.sql
-- Repara "permission denied for table" (PostgREST 42501 -> HTTP 401/403) en las
-- tablas que se crearon sin los default privileges de Supabase. Las policies RLS
-- ya existen, pero sin GRANT la tabla es inaccesible para todos los roles.
-- Detectado: chat_history (historial del chat), contact_messages (formulario),
-- lesson_progress, reviews, course_chunks.

-- Tablas usadas por la app (RLS restringe a filas propias / admins)
GRANT SELECT, INSERT, DELETE ON public.chat_history TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_progress TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_messages TO anon, authenticated, service_role;

-- Solo backend (service_role) hasta verificar RLS antes de exponerlas al cliente
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_chunks TO service_role;

-- Secuencias de respaldo (si algún id usa serial/nextval)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Tablas/secuencias futuras creadas por el rol que ejecute este script
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
