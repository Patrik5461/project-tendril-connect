ALTER TABLE public.tenders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR';

CREATE OR REPLACE FUNCTION public.get_active_tenders_stats()
RETURNS TABLE(active_count integer, total_value_eur numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::int AS active_count,
    COALESCE(SUM(estimated_value) FILTER (
      WHERE COALESCE(currency, 'EUR') = 'EUR' AND estimated_value IS NOT NULL
    ), 0)::numeric AS total_value_eur
  FROM public.tenders
  WHERE deadline >= now()
     OR (deadline IS NULL AND published_at >= now() - interval '30 days');
$$;

GRANT EXECUTE ON FUNCTION public.get_active_tenders_stats() TO anon, authenticated, service_role;