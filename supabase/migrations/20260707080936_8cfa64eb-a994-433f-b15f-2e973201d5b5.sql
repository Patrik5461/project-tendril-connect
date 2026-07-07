
CREATE TABLE IF NOT EXISTS public.user_radars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Môj radar',
  keywords text[] NOT NULL DEFAULT '{}',
  cpv_codes text[] NOT NULL DEFAULT '{}',
  regions text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_radars TO authenticated;
GRANT ALL ON public.user_radars TO service_role;

ALTER TABLE public.user_radars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own radars"
  ON public.user_radars FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_radars_user_idx ON public.user_radars (user_id);

CREATE TRIGGER user_radars_updated_at
  BEFORE UPDATE ON public.user_radars
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migrácia existujúcich filtrov: pre každého používateľa s neprázdnymi filtrami
-- vytvor jeden radar "Môj radar", ak ešte nemá žiadny.
INSERT INTO public.user_radars (user_id, name, keywords, cpv_codes, regions, active)
SELECT
  up.user_id,
  'Môj radar',
  COALESCE(up.keywords, '{}'),
  COALESCE(up.cpv_codes, '{}'),
  COALESCE(up.regions, '{}'),
  true
FROM public.user_preferences up
WHERE (
  (up.keywords IS NOT NULL AND array_length(up.keywords, 1) > 0)
  OR (up.cpv_codes IS NOT NULL AND array_length(up.cpv_codes, 1) > 0)
  OR (up.regions IS NOT NULL AND array_length(up.regions, 1) > 0)
)
AND NOT EXISTS (
  SELECT 1 FROM public.user_radars ur WHERE ur.user_id = up.user_id
);
