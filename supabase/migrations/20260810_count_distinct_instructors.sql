-- Migration: create RPC to count distinct instructors with published courses
-- Run: supabase db push / apply migrations in your Supabase project

CREATE OR REPLACE FUNCTION public.count_distinct_instructors()
RETURNS integer AS $$
  SELECT COUNT(DISTINCT instructor_id) FROM public.courses WHERE status = 'published';
$$ LANGUAGE sql STABLE;
