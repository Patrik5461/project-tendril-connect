ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS trial_ai_analyses_used integer NOT NULL DEFAULT 0;

-- Atomic: check if trial has credit left and consume it for a given tender.
-- Returns { allowed, remaining, unlimited, already_consumed }.
-- Skips increment for premium (unlimited) and when the tender already has an analysis row
-- (rerun / subsequent AI step for the same tender counts as the same "package").
CREATE OR REPLACE FUNCTION public.consume_ai_credit(_tender_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _status text;
  _tier text;
  _used int;
  _already boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT subscription_status, COALESCE(subscription_tier,'basic'), COALESCE(trial_ai_analyses_used,0)
    INTO _status, _tier, _used
  FROM public.user_preferences WHERE user_id = _uid;

  IF _status IS NULL THEN
    -- No prefs row yet -> treat as fresh trial with 0 used.
    _status := 'trial'; _tier := 'basic'; _used := 0;
  END IF;

  -- Premium active: unlimited.
  IF _status = 'active' AND _tier = 'premium' THEN
    RETURN jsonb_build_object('allowed', true, 'unlimited', true, 'remaining', -1, 'already_consumed', false);
  END IF;

  -- Basic or expired: no AI.
  IF _status <> 'trial' THEN
    RETURN jsonb_build_object('allowed', false, 'unlimited', false, 'remaining', 0, 'already_consumed', false, 'reason', 'no_ai_access');
  END IF;

  -- Trial: check if tender already consumed (rerun / package continuation).
  SELECT EXISTS(SELECT 1 FROM public.tender_analysis WHERE user_id = _uid AND tender_id = _tender_id)
    INTO _already;

  IF _already THEN
    RETURN jsonb_build_object('allowed', true, 'unlimited', false, 'remaining', GREATEST(0, 5 - _used), 'already_consumed', true);
  END IF;

  -- Fresh tender: enforce limit.
  IF _used >= 5 THEN
    RETURN jsonb_build_object('allowed', false, 'unlimited', false, 'remaining', 0, 'already_consumed', false, 'reason', 'trial_limit');
  END IF;

  UPDATE public.user_preferences
     SET trial_ai_analyses_used = _used + 1, updated_at = now()
   WHERE user_id = _uid;

  RETURN jsonb_build_object('allowed', true, 'unlimited', false, 'remaining', 5 - (_used + 1), 'already_consumed', false);
END;
$$;

-- Read-only view of remaining credits for the current user.
CREATE OR REPLACE FUNCTION public.get_ai_credit_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _status text; _tier text; _used int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT subscription_status, COALESCE(subscription_tier,'basic'), COALESCE(trial_ai_analyses_used,0)
    INTO _status, _tier, _used
  FROM public.user_preferences WHERE user_id = _uid;
  IF _status IS NULL THEN _status := 'trial'; _tier := 'basic'; _used := 0; END IF;

  IF _status = 'active' AND _tier = 'premium' THEN
    RETURN jsonb_build_object('status', _status, 'tier', _tier, 'unlimited', true, 'used', _used, 'limit', 5, 'remaining', -1);
  END IF;
  IF _status = 'trial' THEN
    RETURN jsonb_build_object('status', _status, 'tier', _tier, 'unlimited', false, 'used', _used, 'limit', 5, 'remaining', GREATEST(0, 5 - _used));
  END IF;
  RETURN jsonb_build_object('status', _status, 'tier', _tier, 'unlimited', false, 'used', _used, 'limit', 5, 'remaining', 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_ai_credit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_credit_status() TO authenticated;