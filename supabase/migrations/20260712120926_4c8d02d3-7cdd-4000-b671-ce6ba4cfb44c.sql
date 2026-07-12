
CREATE TABLE IF NOT EXISTS public.admin_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.admin_secrets TO service_role;
-- Explicitly no grants for anon/authenticated: only service_role (edge functions) may read/write.

ALTER TABLE public.admin_secrets ENABLE ROW LEVEL SECURITY;

-- No policies: even authenticated users cannot access this table directly.
-- Only edge functions using service role key can read/write.
