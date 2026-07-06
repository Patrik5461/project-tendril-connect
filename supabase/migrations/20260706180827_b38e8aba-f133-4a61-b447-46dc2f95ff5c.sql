
CREATE OR REPLACE FUNCTION public.get_active_tenders_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.tenders
  WHERE deadline >= now()
     OR (deadline IS NULL AND published_at >= now() - interval '30 days');
$$;

GRANT EXECUTE ON FUNCTION public.get_active_tenders_count() TO anon, authenticated;
