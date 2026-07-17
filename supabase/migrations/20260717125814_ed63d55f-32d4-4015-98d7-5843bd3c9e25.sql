
-- Lock down SECURITY DEFINER functions in the public schema.
-- Revoke default PUBLIC execute and grant only to the roles that need each one.

-- Trigger / cron / internal helpers: no API callers.
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_trials() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_active_tenders_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._user_tender_base(uuid, text, uuid[], text) FROM PUBLIC, anon, authenticated;

-- Public (anon) endpoints: landing stats + SEO pages.
REVOKE ALL ON FUNCTION public.get_active_tenders_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_tenders_stats() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_seo_tenders(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seo_tenders(text, text, integer) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.count_seo_active_tenders(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_seo_active_tenders(text, text) TO anon, authenticated;

-- Authenticated-only functions (self-authorized via auth.uid() / has_role checks inside).
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.get_ai_credit_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_credit_status() TO authenticated;

REVOKE ALL ON FUNCTION public.consume_ai_credit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_credit(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_ai_summaries_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ai_summaries_enabled(boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.search_user_tenders(text, uuid[], text, text[], text, integer, integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_user_tenders(text, uuid[], text, text[], text, integer, integer, text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.user_tenders_country_facets(text, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_tenders_country_facets(text, uuid[], text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_overview_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview_stats() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_list_users(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_subscription(uuid, text, timestamptz, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(uuid, text, timestamptz, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_gopay_mode() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_gopay_mode() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_gopay_mode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_gopay_mode(text) TO authenticated;

-- admin_secrets: RLS is on but had no policies. Make intent explicit:
-- service_role only (bypasses RLS anyway); deny anon/authenticated.
REVOKE ALL ON TABLE public.admin_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_secrets TO service_role;

DROP POLICY IF EXISTS "admin_secrets service role only" ON public.admin_secrets;
CREATE POLICY "admin_secrets service role only"
  ON public.admin_secrets
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);
