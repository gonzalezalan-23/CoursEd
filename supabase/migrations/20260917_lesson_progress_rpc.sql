-- RPC function to persist lesson progress (bypasses RLS)
-- Uses SECURITY DEFINER so it runs with the function owner's permissions
CREATE OR REPLACE FUNCTION public.save_lesson_progress(
  p_user_id UUID,
  p_lesson_id UUID,
  p_course_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.lesson_progress (user_id, lesson_id, course_id, completed_at)
  VALUES (p_user_id, p_lesson_id, p_course_id, now())
  ON CONFLICT (user_id, lesson_id) DO UPDATE
    SET completed_at = now();
END;
$$;

-- RPC function to get completed lessons for a user and course
CREATE OR REPLACE FUNCTION public.get_completed_lessons(
  p_user_id UUID,
  p_course_id UUID
)
RETURNS TABLE(lesson_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT lp.lesson_id
  FROM public.lesson_progress lp
  WHERE lp.user_id = p_user_id
    AND lp.course_id = p_course_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.save_lesson_progress(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_completed_lessons(UUID, UUID) TO authenticated;
