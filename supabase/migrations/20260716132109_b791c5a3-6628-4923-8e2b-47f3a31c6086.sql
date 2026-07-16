
-- Add subscription source + note
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS subscription_source text NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_note text;

-- Backfill: any 'active' with a gopay_recurrence_id = paid; other active = manual; trial/expired unchanged
UPDATE public.user_preferences
   SET subscription_source = CASE
     WHEN subscription_status = 'active' AND gopay_recurrence_id IS NOT NULL THEN 'paid'
     WHEN subscription_status = 'active' THEN 'manual'
     WHEN subscription_status = 'expired' THEN 'paid'
     ELSE 'trial'
   END
 WHERE subscription_source = 'trial';

-- Audit log
CREATE TABLE IF NOT EXISTS public.subscription_admin_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL,
  status text,
  valid_until timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_admin_log TO authenticated;
GRANT ALL ON public.subscription_admin_log TO service_role;
ALTER TABLE public.subscription_admin_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit" ON public.subscription_admin_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RPC: manually set subscription for a user
CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  _user_id uuid,
  _status text,
  _valid_until timestamptz,
  _note text,
  _source text
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

  INSERT INTO public.user_preferences (user_id, subscription_status, subscription_valid_until, subscription_note, subscription_source, updated_at)
  VALUES (_user_id, _status, _valid_until, _note, _source, now())
  ON CONFLICT (user_id) DO UPDATE
    SET subscription_status   = EXCLUDED.subscription_status,
        subscription_valid_until = EXCLUDED.subscription_valid_until,
        subscription_note     = EXCLUDED.subscription_note,
        subscription_source   = EXCLUDED.subscription_source,
        updated_at            = now();

  INSERT INTO public.subscription_admin_log (admin_id, user_id, action, status, valid_until, note)
  VALUES (_admin, _user_id, 'set', _status, _valid_until, _note);

  RETURN jsonb_build_object('ok', true);
END; $$;

-- Update expire_trials: skip manual subscriptions
CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH upd AS (
    UPDATE public.user_preferences
       SET subscription_status = 'expired',
           updated_at = now()
     WHERE subscription_status = 'trial'
       AND subscription_source <> 'manual'
       AND trial_started_at < now() - interval '60 days'
     RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::int FROM upd;
$$;

-- Update admin_list_users to include source + note
DROP FUNCTION IF EXISTS public.admin_list_users(integer);
CREATE OR REPLACE FUNCTION public.admin_list_users(_limit integer DEFAULT 200)
RETURNS TABLE(
  user_id uuid,
  email text,
  created_at timestamptz,
  subscription_status text,
  subscription_source text,
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
         up.subscription_note::text,
         up.trial_started_at, up.subscription_valid_until,
         COALESCE((SELECT COUNT(*)::int FROM public.user_radars r WHERE r.user_id=u.id), 0)
  FROM auth.users u
  LEFT JOIN public.user_preferences up ON up.user_id=u.id
  ORDER BY u.created_at DESC
  LIMIT GREATEST(_limit,1);
END; $$;

-- Update overview: include manual breakdown
CREATE OR REPLACE FUNCTION public.admin_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_build_object(
    'users', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'trial', COUNT(*) FILTER (WHERE subscription_status='trial'),
        'active', COUNT(*) FILTER (WHERE subscription_status='active'),
        'expired', COUNT(*) FILTER (WHERE subscription_status='expired'),
        'paid', COUNT(*) FILTER (WHERE subscription_status='active' AND COALESCE(subscription_source,'trial')='paid'),
        'manual', COUNT(*) FILTER (WHERE subscription_status='active' AND COALESCE(subscription_source,'trial')='manual')
      ) FROM public.user_preferences
    ),
    'tenders_by_source', (
      SELECT COALESCE(jsonb_object_agg(source, cnt), '{}'::jsonb) FROM (
        SELECT COALESCE(source,'unknown') AS source, COUNT(*)::int AS cnt
        FROM public.tenders GROUP BY 1
      ) t
    ),
    'tenders_source_breakdown', (
      SELECT COALESCE(jsonb_object_agg(source, jsonb_build_object(
        'total', total, 'active', active, 'expired', expired
      )), '{}'::jsonb)
      FROM (
        SELECT
          COALESCE(source,'unknown') AS source,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE deadline >= now()
               OR (deadline IS NULL AND published_at >= now() - interval '30 days')
          )::int AS active,
          COUNT(*) FILTER (
            WHERE NOT (
              deadline >= now()
              OR (deadline IS NULL AND published_at >= now() - interval '30 days')
            )
          )::int AS expired
        FROM public.tenders GROUP BY 1
      ) t
    ),
    'tenders_by_country', (
      SELECT COALESCE(jsonb_object_agg(country, cnt), '{}'::jsonb) FROM (
        SELECT COALESCE(country,'??') AS country, COUNT(*)::int AS cnt
        FROM public.tenders GROUP BY 1 ORDER BY 2 DESC LIMIT 20
      ) t
    ),
    'last_fetch', (
      SELECT COALESCE(jsonb_object_agg(source, last_at), '{}'::jsonb) FROM (
        SELECT COALESCE(source,'unknown') AS source, MAX(created_at) AS last_at
        FROM public.tenders GROUP BY 1
      ) t
    ),
    'active_tenders', (SELECT public.get_active_tenders_count()),
    'total_tenders', (SELECT COUNT(*)::int FROM public.tenders)
  ) INTO result;
  RETURN result;
END; $$;
