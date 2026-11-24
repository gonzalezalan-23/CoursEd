-- Migration: Full-text search for RAG (sin API externa)
-- Run this in Supabase SQL Editor
-- IMPORTANTE: Ejecutar todo junto, o paso a paso en este orden exacto

-- 0. Limpiar función anterior si existe
DROP FUNCTION IF EXISTS search_courses(text, integer);

-- 1. Agregar columna tsvector a lessons (si no existe)
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Poblar search_vector con título de curso + módulo + lección + contenido
UPDATE lessons l
SET search_vector = to_tsvector('spanish',
  coalesce(c.title, '') || ' ' ||
  coalesce(m.title, '') || ' ' ||
  coalesce(l.title, '') || ' ' ||
  coalesce(l.description, '') || ' ' ||
  coalesce(l.text_content, '')
)
FROM modules m, courses c
WHERE l.module_id = m.id AND l.course_id = c.id;

-- 3. Índice GIN para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_lessons_search ON lessons USING GIN (search_vector);

-- 4. Trigger para mantener search_vector actualizado al modificar lecciones
CREATE OR REPLACE FUNCTION update_lesson_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE lessons l
  SET search_vector = to_tsvector('spanish',
    coalesce(c.title, '') || ' ' ||
    coalesce(m.title, '') || ' ' ||
    coalesce(l.title, '') || ' ' ||
    coalesce(l.description, '') || ' ' ||
    coalesce(l.text_content, '')
  )
  FROM modules m, courses c
  WHERE l.id = NEW.id AND l.module_id = m.id AND l.course_id = c.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_search_vector ON lessons;
CREATE TRIGGER trg_update_search_vector
  AFTER INSERT OR UPDATE OF title, description, text_content
  ON lessons
  FOR EACH ROW
  EXECUTE FUNCTION update_lesson_search_vector();

-- 5. Trigger para mantener search_vector al cambiar título de curso
CREATE OR REPLACE FUNCTION update_course_search_vectors()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE lessons l
  SET search_vector = to_tsvector('spanish',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(m.title, '') || ' ' ||
    coalesce(l.title, '') || ' ' ||
    coalesce(l.description, '') || ' ' ||
    coalesce(l.text_content, '')
  )
  FROM modules m
  WHERE l.course_id = NEW.id AND l.module_id = m.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_course_search ON courses;
CREATE TRIGGER trg_update_course_search
  AFTER UPDATE OF title ON courses
  FOR EACH ROW
  EXECUTE FUNCTION update_course_search_vectors();

-- 6. Función de búsqueda simple (full-text con OR)
CREATE OR REPLACE FUNCTION search_courses(
  query_text TEXT,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  lesson_id UUID,
  course_id UUID,
  lesson_title TEXT,
  course_title TEXT,
  lesson_type TEXT,
  snippet TEXT,
  rank REAL
)
LANGUAGE plpgsql
AS $$
DECLARE
  tsquery_str TEXT;
BEGIN
  -- Convertir palabras separadas por espacios en OR query
  tsquery_str := regexp_replace(trim(query_text), '\s+', ' | ', 'g');

  IF length(tsquery_str) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    l.id AS lesson_id,
    l.course_id,
    l.title::TEXT AS lesson_title,
    c.title::TEXT AS course_title,
    l.lesson_type::TEXT AS lesson_type,
    ts_headline('spanish',
      coalesce(c.title, '') || ' - ' ||
      coalesce(l.title, '') || ': ' ||
      coalesce(l.description, l.text_content, ''),
      to_tsquery('spanish', tsquery_str),
      'StartSel=**, StopSel=**, MaxWords=50, MinWords=20'
    ) AS snippet,
    ts_rank(l.search_vector, to_tsquery('spanish', tsquery_str)) AS rank
  FROM lessons l
  JOIN courses c ON c.id = l.course_id
  WHERE l.search_vector @@ to_tsquery('spanish', tsquery_str)
    AND c.status = 'published'
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$;

-- 7. Grants
GRANT EXECUTE ON FUNCTION search_courses(TEXT, INT) TO service_role, anon, authenticated;
GRANT SELECT ON lessons TO service_role, anon, authenticated;
GRANT SELECT ON courses TO service_role, anon, authenticated;
GRANT SELECT ON modules TO service_role, anon, authenticated;
