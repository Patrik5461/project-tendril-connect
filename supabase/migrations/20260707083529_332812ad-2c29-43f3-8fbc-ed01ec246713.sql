CREATE TABLE IF NOT EXISTS public.help_chat_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.help_chat_usage TO authenticated;
GRANT ALL ON public.help_chat_usage TO service_role;

ALTER TABLE public.help_chat_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own help usage"
  ON public.help_chat_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages help usage"
  ON public.help_chat_usage FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_help_chat_usage_user_time
  ON public.help_chat_usage (user_id, created_at DESC);