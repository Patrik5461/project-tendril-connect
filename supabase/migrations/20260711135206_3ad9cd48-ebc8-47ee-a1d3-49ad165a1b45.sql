
-- 1) Enum + tabuľka rolí
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('user','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2) has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;

DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- 3) Admin overview stats
CREATE OR REPLACE FUNCTION public.admin_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'users', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'trial', COUNT(*) FILTER (WHERE subscription_status='trial'),
        'active', COUNT(*) FILTER (WHERE subscription_status='active'),
        'expired', COUNT(*) FILTER (WHERE subscription_status='expired')
      ) FROM public.user_preferences
    ),
    'tenders_by_source', (
      SELECT COALESCE(jsonb_object_agg(source, cnt), '{}'::jsonb) FROM (
        SELECT COALESCE(source,'unknown') AS source, COUNT(*)::int AS cnt
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
    'active_tenders', (SELECT public.get_active_tenders_count())
  ) INTO result;
  RETURN result;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_overview_stats() TO authenticated;

-- 4) Admin list users
CREATE OR REPLACE FUNCTION public.admin_list_users(_limit int DEFAULT 200)
RETURNS TABLE(
  user_id uuid,
  email text,
  created_at timestamptz,
  subscription_status text,
  trial_started_at timestamptz,
  subscription_valid_until timestamptz,
  radars_count int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at,
         up.subscription_status::text, up.trial_started_at, up.subscription_valid_until,
         COALESCE((SELECT COUNT(*)::int FROM public.user_radars r WHERE r.user_id=u.id), 0)
  FROM auth.users u
  LEFT JOIN public.user_preferences up ON up.user_id=u.id
  ORDER BY u.created_at DESC
  LIMIT GREATEST(_limit,1);
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_list_users(int) TO authenticated;

-- 5) GoPay mode override in app_settings
CREATE OR REPLACE FUNCTION public.admin_get_gopay_mode()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((value #>> '{}'), '') FROM public.app_settings WHERE key='gopay_mode';
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_gopay_mode() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_gopay_mode(_mode text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _mode NOT IN ('sandbox','production','') THEN RAISE EXCEPTION 'invalid mode'; END IF;
  INSERT INTO public.app_settings(key, value, updated_at)
  VALUES ('gopay_mode', to_jsonb(_mode), now())
  ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
  RETURN _mode;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_set_gopay_mode(text) TO authenticated;

-- 6) Bootstrap admin role for admin@tendrik.sk if the user already exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE lower(email)='admin@tendrik.sk'
ON CONFLICT DO NOTHING;
