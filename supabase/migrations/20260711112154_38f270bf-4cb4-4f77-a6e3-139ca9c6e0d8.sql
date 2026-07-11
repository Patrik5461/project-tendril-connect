
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS subscription_valid_until timestamptz,
  ADD COLUMN IF NOT EXISTS gopay_subscription_id text,
  ADD COLUMN IF NOT EXISTS gopay_recurrence_id text,
  ADD COLUMN IF NOT EXISTS subscription_cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz;

CREATE TABLE IF NOT EXISTS public.gopay_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  gopay_payment_id text,
  parent_id text,
  state text,
  amount_cents integer,
  currency text,
  raw jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.gopay_payment_events TO authenticated;
GRANT ALL ON public.gopay_payment_events TO service_role;

ALTER TABLE public.gopay_payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payment events"
  ON public.gopay_payment_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS gopay_payment_events_user_idx
  ON public.gopay_payment_events(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS gopay_payment_events_payment_idx
  ON public.gopay_payment_events(gopay_payment_id);
