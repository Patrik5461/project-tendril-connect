
CREATE TABLE public.seo_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_type text NOT NULL CHECK (page_type IN ('category','region','category_region')),
  category_slug text,
  cpv_prefix text,
  region_slug text,
  region_name text,
  h1 text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  intro_text text NOT NULL,
  active_tenders_count integer NOT NULL DEFAULT 0,
  last_generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX seo_pages_unique_combo
  ON public.seo_pages (page_type, COALESCE(category_slug,''), COALESCE(region_slug,''));

CREATE INDEX seo_pages_type_idx ON public.seo_pages(page_type);
CREATE INDEX seo_pages_category_slug_idx ON public.seo_pages(category_slug);
CREATE INDEX seo_pages_region_slug_idx ON public.seo_pages(region_slug);

GRANT SELECT ON public.seo_pages TO anon, authenticated;
GRANT ALL ON public.seo_pages TO service_role;

ALTER TABLE public.seo_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seo_pages public read"
  ON public.seo_pages FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TRIGGER update_seo_pages_updated_at
  BEFORE UPDATE ON public.seo_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_seo_tenders(
  _cpv_prefix text,
  _region_name text,
  _limit int DEFAULT 20
) RETURNS SETOF public.tenders
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.tenders t
  WHERE (
    t.deadline >= now()
    OR (t.deadline IS NULL AND t.published_at >= now() - interval '30 days')
  )
  AND (_cpv_prefix IS NULL OR (t.cpv_code IS NOT NULL AND t.cpv_code LIKE _cpv_prefix || '%'))
  AND (
    _region_name IS NULL
    OR _region_name = ''
    OR lower(_region_name) = 'celé slovensko'
    OR lower(_region_name) = 'cele slovensko'
    OR (t.country = 'SK' AND t.region = _region_name)
  )
  AND (
    _region_name IS NULL
    OR lower(_region_name) NOT IN ('celé slovensko','cele slovensko')
    OR t.country = 'SK'
  )
  ORDER BY
    CASE WHEN t.deadline IS NULL THEN 1 ELSE 0 END,
    t.deadline ASC,
    t.published_at DESC
  LIMIT GREATEST(_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.count_seo_active_tenders(
  _cpv_prefix text,
  _region_name text
) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.tenders t
  WHERE (
    t.deadline >= now()
    OR (t.deadline IS NULL AND t.published_at >= now() - interval '30 days')
  )
  AND (_cpv_prefix IS NULL OR (t.cpv_code IS NOT NULL AND t.cpv_code LIKE _cpv_prefix || '%'))
  AND (
    _region_name IS NULL
    OR _region_name = ''
    OR lower(_region_name) = 'celé slovensko'
    OR lower(_region_name) = 'cele slovensko'
    OR (t.country = 'SK' AND t.region = _region_name)
  )
  AND (
    _region_name IS NULL
    OR lower(_region_name) NOT IN ('celé slovensko','cele slovensko')
    OR t.country = 'SK'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_seo_tenders(text, text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_seo_active_tenders(text, text) TO anon, authenticated, service_role;
