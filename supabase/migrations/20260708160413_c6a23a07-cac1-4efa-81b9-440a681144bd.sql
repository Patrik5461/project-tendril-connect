
-- Helper: filtered tender set for the current user (foryou/saved/hidden + q + radars).
-- Country filter and sort/pagination happen in the caller.
CREATE OR REPLACE FUNCTION public._user_tender_base(
  _uid uuid,
  _tab text,
  _radar_ids uuid[],
  _q text
)
RETURNS SETOF public.tenders
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (
    SELECT * FROM public.user_radars
    WHERE user_id = _uid
      AND active
      AND (_radar_ids IS NULL OR array_length(_radar_ids, 1) IS NULL OR id = ANY(_radar_ids))
  )
  SELECT t.*
  FROM public.tenders t
  WHERE (
    CASE _tab
      WHEN 'saved' THEN EXISTS (
        SELECT 1 FROM public.user_tender_actions a
        WHERE a.user_id = _uid AND a.tender_id = t.id AND a.action = 'saved'
      )
      WHEN 'hidden' THEN EXISTS (
        SELECT 1 FROM public.user_tender_actions a
        WHERE a.user_id = _uid AND a.tender_id = t.id AND a.action = 'hidden'
      )
      ELSE (
        (t.deadline >= now()
          OR (t.deadline IS NULL AND t.published_at >= now() - interval '30 days'))
        AND NOT EXISTS (
          SELECT 1 FROM public.user_tender_actions a
          WHERE a.user_id = _uid AND a.tender_id = t.id AND a.action = 'hidden'
        )
        AND EXISTS (
          SELECT 1 FROM r
          WHERE (
              'ALL' = ANY(COALESCE(NULLIF(r.countries, ARRAY[]::text[]), ARRAY['SK']))
              OR t.country = ANY(COALESCE(NULLIF(r.countries, ARRAY[]::text[]), ARRAY['SK']))
            )
            AND (
              t.country IS DISTINCT FROM 'SK'
              OR 'Celé Slovensko' = ANY(COALESCE(r.regions, ARRAY[]::text[]))
              OR COALESCE(array_length(r.regions, 1), 0) = 0
              OR t.region IS NULL
              OR t.region = ANY(r.regions)
            )
            AND (
              (COALESCE(array_length(r.keywords, 1), 0) = 0
                AND COALESCE(array_length(r.cpv_codes, 1), 0) = 0)
              OR EXISTS (
                SELECT 1 FROM unnest(COALESCE(r.keywords, ARRAY[]::text[])) kw
                WHERE public.unaccent(lower(t.title || ' ' || COALESCE(t.description, '')))
                      LIKE '%' || public.unaccent(lower(kw)) || '%'
              )
              OR (
                COALESCE(array_length(r.cpv_codes, 1), 0) > 0
                AND t.cpv_code ~ '^\d{2,}'
                AND EXISTS (
                  SELECT 1 FROM unnest(r.cpv_codes) c
                  WHERE t.cpv_code LIKE c || '%'
                )
              )
              OR (t.cpv_code IS NULL OR t.cpv_code !~ '^\d{2,}')
            )
        )
      )
    END
  )
  AND (
    _q IS NULL OR length(btrim(_q)) = 0
    OR public.unaccent(lower(t.title)) LIKE '%' || public.unaccent(lower(_q)) || '%'
    OR public.unaccent(lower(COALESCE(t.contracting_authority, ''))) LIKE '%' || public.unaccent(lower(_q)) || '%'
    OR public.unaccent(lower(COALESCE(t.description, ''))) LIKE '%' || public.unaccent(lower(_q)) || '%'
  );
$$;

REVOKE ALL ON FUNCTION public._user_tender_base(uuid, text, uuid[], text) FROM PUBLIC;

-- Paginated search: returns { total, rows } as JSON for a single round-trip.
CREATE OR REPLACE FUNCTION public.search_user_tenders(
  _tab text,
  _radar_ids uuid[],
  _q text,
  _countries text[],
  _sort text,
  _from int,
  _limit int
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH b AS (
    SELECT *
    FROM public._user_tender_base(auth.uid(), _tab, _radar_ids, _q)
    WHERE _countries IS NULL
       OR array_length(_countries, 1) IS NULL
       OR COALESCE(upper(country), 'XX') = ANY(_countries)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM b),
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(x)) FROM (
        SELECT * FROM b
        ORDER BY
          CASE WHEN _sort = 'deadline' THEN deadline END ASC NULLS LAST,
          CASE WHEN _sort = 'newest'   THEN published_at END DESC NULLS LAST,
          CASE WHEN _sort = 'value'    THEN estimated_value END DESC NULLS LAST,
          id
        OFFSET GREATEST(_from, 0)
        LIMIT  LEAST(GREATEST(_limit, 1), 500)
      ) x
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.search_user_tenders(text, uuid[], text, text[], text, int, int) TO authenticated;

-- Country facets for the dashboard country filter (pre-country-filter counts).
CREATE OR REPLACE FUNCTION public.user_tenders_country_facets(
  _tab text,
  _radar_ids uuid[],
  _q text
)
RETURNS TABLE(country text, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(upper(country), 'XX') AS country, count(*)::bigint AS cnt
  FROM public._user_tender_base(auth.uid(), _tab, _radar_ids, _q)
  GROUP BY 1
  ORDER BY cnt DESC;
$$;

GRANT EXECUTE ON FUNCTION public.user_tenders_country_facets(text, uuid[], text) TO authenticated;
