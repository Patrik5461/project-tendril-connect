
-- Public read of measurement IDs only
CREATE OR REPLACE FUNCTION public.get_analytics_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'enabled', COALESCE(value->'enabled', 'false'::jsonb),
        'gtm_id', COALESCE(value->'gtm_id', '""'::jsonb),
        'ga4_id', COALESCE(value->'ga4_id', '""'::jsonb),
        'ads_id', COALESCE(value->'ads_id', '""'::jsonb),
        'conversion_labels', COALESCE(value->'conversion_labels', '{}'::jsonb),
        'debug', COALESCE(value->'debug', 'false'::jsonb)
      )
      FROM public.app_settings WHERE key = 'analytics_config'
    ),
    jsonb_build_object('enabled', false, 'gtm_id', '', 'ga4_id', '', 'ads_id', '',
                       'conversion_labels', '{}'::jsonb, 'debug', false)
  );
$$;

REVOKE ALL ON FUNCTION public.get_analytics_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_config() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_get_analytics_config()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT value INTO v FROM public.app_settings WHERE key = 'analytics_config';
  RETURN COALESCE(v, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_analytics_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_analytics_config() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_analytics_config(_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO public.app_settings(key, value, updated_at)
  VALUES ('analytics_config', _config, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN _config;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_analytics_config(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_analytics_config(jsonb) TO authenticated, service_role;
