ALTER TABLE public.grant_calls
  ADD COLUMN IF NOT EXISTS last_change_at timestamptz,
  ADD COLUMN IF NOT EXISTS search_text text;