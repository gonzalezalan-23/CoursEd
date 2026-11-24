-- Add lesson_type, pdf_url and quiz columns to lessons table
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS lesson_type VARCHAR(10) NOT NULL DEFAULT 'video'
    CHECK (lesson_type IN ('video', 'pdf', 'quiz')),
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS quiz JSONB;

-- Make video_url nullable (pdf/quiz lessons don't need it)
ALTER TABLE public.lessons
  ALTER COLUMN video_url DROP NOT NULL;

-- Backfill existing rows
UPDATE public.lessons SET lesson_type = 'video' WHERE lesson_type IS NULL;
