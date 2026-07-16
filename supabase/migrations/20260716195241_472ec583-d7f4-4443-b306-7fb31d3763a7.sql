
-- Add subscription_tier ('basic' | 'premium') to user_preferences.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'basic'
    CHECK (subscription_tier IN ('basic', 'premium'));

-- Existing active paying users keep monitoring only (basic) — they lose no feature they had.
-- Existing manual/comp users we conservatively keep on basic; admin can bump to premium.
UPDATE public.user_preferences
   SET subscription_tier = 'basic'
 WHERE subscription_status = 'active';

-- Update admin_set_subscription to accept _tier.
DROP FUNCTION IF EXISTS public.admin_set_subscription(uuid, text, timestamptz, text, text);
CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  _user_id uuid,
  _status text,
  _valid_until timestamptz,
  _note text,
  _source text,
  _tier text DEFAULT 'basic'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _admin uuid := auth.uid();
BEGIN
  IF NOT public.has_role(_admin, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _status NOT IN ('trial','active','expired') THEN RAISE EXCEPTION 'invalid status'; END IF;
  IF _source NOT IN ('trial','paid','manual') THEN RAISE EXCEPTION 'invalid source'; END IF;
  IF _tier NOT IN ('basic','premium') THEN RAISE EXCEPTION 'invalid tier'; END IF;

  INSERT INTO public.user_preferences (
    user_id, subscription_status, subscription_valid_until,
    subscription_note, subscription_source, subscription_tier, updated_at
  )
  VALUES (_user_id, _status, _valid_until, _note, _source, _tier, now())
  ON CONFLICT (user_id) DO UPDATE
    SET subscription_status   = EXCLUDED.subscription_status,
        subscription_valid_until = EXCLUDED.subscription_valid_until,
        subscription_note     = EXCLUDED.subscription_note,
        subscription_source   = EXCLUDED.subscription_source,
        subscription_tier     = EXCLUDED.subscription_tier,
        updated_at            = now();

  INSERT INTO public.subscription_admin_log (admin_id, user_id, action, status, valid_until, note)
  VALUES (_admin, _user_id, 'set', _status, _valid_until,
          COALESCE(_note, '') || ' [tier=' || _tier || ']');

  RETURN jsonb_build_object('ok', true);
END; $$;

-- Extend admin_list_users to include tier.
DROP FUNCTION IF EXISTS public.admin_list_users(integer);
CREATE OR REPLACE FUNCTION public.admin_list_users(_limit integer DEFAULT 200)
RETURNS TABLE(
  user_id uuid,
  email text,
  created_at timestamptz,
  subscription_status text,
  subscription_source text,
  subscription_tier text,
  subscription_note text,
  trial_started_at timestamptz,
  subscription_valid_until timestamptz,
  radars_count integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at,
         up.subscription_status::text,
         COALESCE(up.subscription_source, 'trial')::text,
         COALESCE(up.subscription_tier, 'basic')::text,
         up.subscription_note::text,
         up.trial_started_at, up.subscription_valid_until,
         COALESCE((SELECT COUNT(*)::int FROM public.user_radars r WHERE r.user_id=u.id), 0)
  FROM auth.users u
  LEFT JOIN public.user_preferences up ON up.user_id=u.id
  ORDER BY u.created_at DESC
  LIMIT GREATEST(_limit,1);
END; $$;
