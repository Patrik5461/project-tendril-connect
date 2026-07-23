
CREATE TABLE public.grant_calls (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL DEFAULT 'ITMS21',
  source_id text NOT NULL,
  kod text,
  title text NOT NULL,
  program text,
  poskytovatel text,
  vyhlasovatel text,
  suma_eu numeric,
  suma_sr numeric,
  currency text NOT NULL DEFAULT 'EUR',
  datum_vyhlasenia timestamptz,
  deadline timestamptz,
  stav text NOT NULL DEFAULT 'OTVORENA',
  druh text,
  zameranie text,
  opravneny_ziadatel jsonb NOT NULL DEFAULT '[]'::jsonb,
  miesto_realizacie jsonb NOT NULL DEFAULT '[]'::jsonb,
  oblasti jsonb NOT NULL DEFAULT '[]'::jsonb,
  kontakt jsonb,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  structured_conditions jsonb,
  detail_url text,
  raw jsonb,
  itms_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

GRANT SELECT ON public.grant_calls TO anon;
GRANT SELECT ON public.grant_calls TO authenticated;
GRANT ALL ON public.grant_calls TO service_role;

ALTER TABLE public.grant_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read grant_calls" ON public.grant_calls
  FOR SELECT USING (true);

CREATE INDEX grant_calls_source_id_idx ON public.grant_calls (source, source_id);
CREATE INDEX grant_calls_deadline_idx ON public.grant_calls (deadline);
CREATE INDEX grant_calls_stav_idx ON public.grant_calls (stav);
CREATE INDEX grant_calls_datum_vyhlasenia_idx ON public.grant_calls (datum_vyhlasenia DESC);

CREATE TRIGGER grant_calls_set_updated_at
  BEFORE UPDATE ON public.grant_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cleanup: uzavreté výzvy s deadline starším ako 90 dní. Priebežné (deadline IS NULL) sa nemažú.
CREATE OR REPLACE FUNCTION public.cleanup_grant_calls()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH del AS (
    DELETE FROM public.grant_calls
     WHERE stav IN ('UZAVRETA','ZRUSENA')
       AND deadline IS NOT NULL
       AND deadline < now() - interval '90 days'
    RETURNING 1
  )
  SELECT COALESCE(count(*),0)::int FROM del;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_grant_calls() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_grant_calls() TO service_role;
