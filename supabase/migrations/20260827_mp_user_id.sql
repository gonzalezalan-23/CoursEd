ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS mp_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_mp_user_id
ON public.profiles (mp_user_id);