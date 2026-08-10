DROP FUNCTION IF EXISTS public.admin_list_users(integer);

CREATE OR REPLACE FUNCTION public.admin_list_users(_limit integer DEFAULT 200)
 RETURNS TABLE(user_id uuid, email text, created_at timestamp with time zone, subscription_status text, subscription_source text, subscription_tier text, subscription_note text, billing_period text, trial_started_at timestamp with time zone, subscription_valid_until timestamp with time zone, radars_count integer, grant_radars_count integer, ico text, company_name text, radars jsonb, grant_radars jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at,
         up.subscription_status::text,
         COALESCE(up.subscription_source,'trial')::text,
         COALESCE(up.subscription_tier,'basic')::text,
         up.subscription_note::text,
         COALESCE(up.billing_period,'monthly')::text,
         up.trial_started_at, up.subscription_valid_until,
         COALESCE((SELECT COUNT(*)::int FROM public.user_radars r WHERE r.user_id=u.id),0),
         COALESCE((SELECT COUNT(*)::int FROM public.user_grant_radars gr WHERE gr.user_id=u.id),0),
         cp.ico::text,
         cp.nazov::text,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'name', r.name,
                    'active', r.active,
                    'keywords', to_jsonb(r.keywords),
                    'cpv_codes', to_jsonb(r.cpv_codes),
                    'regions', to_jsonb(r.regions),
                    'countries', to_jsonb(r.countries)
                  ) ORDER BY r.created_at)
           FROM public.user_radars r WHERE r.user_id=u.id
         ), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'name', gr.name,
                    'active', gr.active,
                    'keywords', to_jsonb(gr.keywords),
                    'programs', to_jsonb(gr.programs),
                    'regions', to_jsonb(gr.regions),
                    'applicant_categories', to_jsonb(gr.applicant_categories)
                  ) ORDER BY gr.created_at)
           FROM public.user_grant_radars gr WHERE gr.user_id=u.id
         ), '[]'::jsonb)
  FROM auth.users u
  LEFT JOIN public.user_preferences up ON up.user_id=u.id
  LEFT JOIN public.company_profile cp ON cp.user_id=u.id
  ORDER BY u.created_at DESC
  LIMIT GREATEST(_limit,1);
END; $function$;