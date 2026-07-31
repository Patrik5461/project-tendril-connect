ALTER TABLE public.gopay_payment_events ADD COLUMN IF NOT EXISTS processing_error text;

CREATE OR REPLACE FUNCTION public.admin_stuck_paid_payments(_limit integer DEFAULT 100)
RETURNS TABLE(
  id uuid,
  received_at timestamp with time zone,
  user_id uuid,
  email text,
  gopay_payment_id text,
  amount_cents integer,
  currency text,
  state text,
  processing_error text,
  subscription_status text,
  subscription_tier text,
  subscription_valid_until timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT e.id, e.received_at, e.user_id, u.email::text, e.gopay_payment_id,
         e.amount_cents, e.currency, e.state, e.processing_error,
         up.subscription_status::text, up.subscription_tier::text, up.subscription_valid_until
  FROM public.gopay_payment_events e
  LEFT JOIN auth.users u ON u.id = e.user_id
  LEFT JOIN public.user_preferences up ON up.user_id = e.user_id
  WHERE upper(COALESCE(e.state,'')) = 'PAID'
    AND (
      up.user_id IS NULL
      OR up.subscription_status IS DISTINCT FROM 'active'
      OR up.subscription_valid_until IS NULL
      OR up.subscription_valid_until < now()
    )
  ORDER BY e.received_at DESC
  LIMIT GREATEST(_limit, 1);
END;
$$;