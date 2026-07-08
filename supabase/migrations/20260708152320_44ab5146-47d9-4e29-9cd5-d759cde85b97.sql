
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read settings"
  ON public.app_settings FOR SELECT TO authenticated USING (true);

INSERT INTO public.app_settings (key, value)
VALUES ('ai_summaries_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_ai_summaries_enabled(enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.app_settings (key, value, updated_at)
  VALUES ('ai_summaries_enabled', to_jsonb(enabled), now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();

  UPDATE cron.job
     SET active = enabled
   WHERE jobname = 'generate-missing-summaries-30min';

  RETURN enabled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ai_summaries_enabled(boolean) TO authenticated;
