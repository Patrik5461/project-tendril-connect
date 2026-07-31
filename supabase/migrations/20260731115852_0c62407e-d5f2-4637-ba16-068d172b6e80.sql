INSERT INTO public.app_settings(key, value, updated_at)
VALUES ('gopay_recurring_enabled', 'false'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_gopay_recurring_enabled()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT (value)::text::boolean FROM public.app_settings WHERE key = 'gopay_recurring_enabled'), false);
$$;

REVOKE ALL ON FUNCTION public.get_gopay_recurring_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gopay_recurring_enabled() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_gopay_recurring_enabled(_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.app_settings(key, value, updated_at)
  VALUES ('gopay_recurring_enabled', to_jsonb(_enabled), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN _enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_gopay_recurring_enabled(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_gopay_recurring_enabled(boolean) TO authenticated, service_role;