CREATE OR REPLACE FUNCTION public.get_open_grants_stats()
RETURNS TABLE(open_count integer, total_alloc_eur numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COUNT(*)::int AS open_count,
    COALESCE(SUM(COALESCE(suma_eu, 0) + COALESCE(suma_sr, 0)), 0)::numeric AS total_alloc_eur
  FROM public.grant_calls
  WHERE stav = 'OTVORENA'
    AND (deadline IS NULL OR deadline >= now());
$$;

REVOKE ALL ON FUNCTION public.get_open_grants_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_open_grants_stats() TO anon, authenticated, service_role;