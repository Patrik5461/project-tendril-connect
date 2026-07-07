
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS deadline_reminders boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.sent_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tender_id uuid NOT NULL,
  days_before int NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tender_id, days_before)
);

GRANT SELECT ON public.sent_reminders TO authenticated;
GRANT ALL ON public.sent_reminders TO service_role;

ALTER TABLE public.sent_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sent reminders"
  ON public.sent_reminders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages sent reminders"
  ON public.sent_reminders FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS sent_reminders_user_tender_idx
  ON public.sent_reminders (user_id, tender_id);
