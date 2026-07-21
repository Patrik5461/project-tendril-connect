CREATE OR REPLACE FUNCTION public.search_user_tenders(_tab text, _radar_ids uuid[], _q text, _countries text[], _sort text, _from integer, _limit integer, _sources text[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH b AS (
    SELECT *
    FROM public._user_tender_base(auth.uid(), _tab, _radar_ids, _q)
    WHERE (_countries IS NULL
       OR array_length(_countries, 1) IS NULL
       OR COALESCE(upper(country), 'XX') = ANY(_countries))
      AND (_sources IS NULL
       OR array_length(_sources, 1) IS NULL
       OR upper(source) = ANY(_sources))
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM b),
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(x)) FROM (
        SELECT * FROM b
        ORDER BY
          CASE WHEN _sort = 'deadline'  THEN deadline END ASC NULLS LAST,
          CASE WHEN _sort = 'newest'    THEN published_at END DESC NULLS LAST,
          CASE WHEN _sort = 'value'     THEN estimated_value END DESC NULLS LAST,
          CASE WHEN _sort = 'value_asc' THEN estimated_value END ASC NULLS LAST,
          id
        OFFSET GREATEST(_from, 0)
        LIMIT  LEAST(GREATEST(_limit, 1), 500)
      ) x
    ), '[]'::jsonb)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.search_user_tenders(text, uuid[], text, text[], text, integer, integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_user_tenders(text, uuid[], text, text[], text, integer, integer, text[]) TO authenticated;