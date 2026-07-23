ALTER TABLE public.grant_calls ADD COLUMN IF NOT EXISTS typ text;
CREATE INDEX IF NOT EXISTS idx_grant_calls_typ ON public.grant_calls(typ);