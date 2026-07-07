ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS notification_email text;