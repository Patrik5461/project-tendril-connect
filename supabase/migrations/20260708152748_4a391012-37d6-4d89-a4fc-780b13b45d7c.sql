
ALTER TABLE public.tenders
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS country_name text;

CREATE INDEX IF NOT EXISTS tenders_country_idx ON public.tenders(country);

-- Existing rows are Slovakia-only.
UPDATE public.tenders SET country = 'SK', country_name = 'Slovensko'
 WHERE country IS NULL;

ALTER TABLE public.user_radars
  ADD COLUMN IF NOT EXISTS countries text[] NOT NULL DEFAULT ARRAY['SK']::text[];

-- Ensure existing radars default to SK only.
UPDATE public.user_radars SET countries = ARRAY['SK']::text[]
 WHERE countries IS NULL OR array_length(countries, 1) IS NULL;
