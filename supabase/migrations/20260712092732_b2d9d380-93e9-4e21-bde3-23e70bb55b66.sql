CREATE OR REPLACE FUNCTION public.admin_overview_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'tenders_source_breakdown', (
      SELECT COALESCE(jsonb_object_agg(source, jsonb_build_object(
        'total', total,
        'active', active,
        'expired', expired
      )), '{}'::jsonb)
      FROM (
        SELECT
          COALESCE(source,'unknown') AS source,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE deadline >= now()
               OR (deadline IS NULL AND published_at >= now() - interval '30 days')
          )::int AS active,
          COUNT(*) FILTER (
            WHERE NOT (
              deadline >= now()
              OR (deadline IS NULL AND published_at >= now() - interval '30 days')
            )
          )::int AS expired
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
    'active_tenders', (SELECT public.get_active_tenders_count()),
    'total_tenders', (SELECT COUNT(*)::int FROM public.tenders)
  ) INTO result;
  RETURN result;
END; $function$;