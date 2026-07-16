-- Skrátiť trial z 60 na 30 dní: cron používa túto funkciu na ukončenie trialu.
CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH upd AS (
    UPDATE public.user_preferences
       SET subscription_status = 'expired',
           updated_at = now()
     WHERE subscription_status = 'trial'
       AND subscription_source <> 'manual'
       AND trial_started_at < now() - interval '30 days'
     RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::int FROM upd;
$$;