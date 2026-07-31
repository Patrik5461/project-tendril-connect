-- 1) Nové stĺpce
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS ai_quota_period_start timestamptz;

-- 2) Indexy pre počítanie kvót
CREATE INDEX IF NOT EXISTS tender_analysis_user_created_idx ON public.tender_analysis (user_id, created_at);
CREATE INDEX IF NOT EXISTS grant_analysis_user_created_idx  ON public.grant_analysis  (user_id, created_at);

-- 3) Limit podľa tieru
CREATE OR REPLACE FUNCTION public.ai_monthly_limit(_tier text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _tier WHEN 'komplet' THEN 150 WHEN 'premium' THEN 30 ELSE 0 END;
$$;

-- 4) Stav kvóty (jediný zdroj pravdy)
CREATE OR REPLACE FUNCTION public.get_ai_credit_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _status text; _tier text; _used int; _limit int;
  _start timestamptz; _cnt int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT subscription_status, COALESCE(subscription_tier,'basic'),
         COALESCE(trial_ai_analyses_used,0), ai_quota_period_start
    INTO _status, _tier, _used, _start
  FROM public.user_preferences WHERE user_id = _uid;

  IF _status IS NULL THEN _status := 'trial'; _tier := 'basic'; _used := 0; END IF;

  IF _status = 'trial' THEN
    RETURN jsonb_build_object('status',_status,'tier',_tier,'unlimited',false,
                              'used',_used,'limit',5,'remaining',GREATEST(0,5-_used),
                              'period_start',NULL,'scope','trial');
  END IF;

  IF _status <> 'active' THEN
    RETURN jsonb_build_object('status',_status,'tier',_tier,'unlimited',false,
                              'used',0,'limit',0,'remaining',0,
                              'period_start',NULL,'scope','none');
  END IF;

  _limit := public.ai_monthly_limit(_tier);
  _start := COALESCE(_start, date_trunc('day', now()));
  WHILE _start <= now() - interval '1 month' LOOP
    _start := _start + interval '1 month';
  END LOOP;

  SELECT (SELECT count(*) FROM public.tender_analysis a WHERE a.user_id=_uid AND a.created_at >= _start)
       + (SELECT count(*) FROM public.grant_analysis g  WHERE g.user_id=_uid AND g.created_at >= _start)
    INTO _cnt;

  RETURN jsonb_build_object('status',_status,'tier',_tier,'unlimited',false,
                            'used',_cnt,'limit',_limit,'remaining',GREATEST(0,_limit-_cnt),
                            'period_start',_start,'scope','monthly');
END; $$;

-- 5) Spotreba kreditu – zákazky
CREATE OR REPLACE FUNCTION public.consume_ai_credit(_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _st jsonb; _status text; _tier text; _used int; _limit int; _already boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _st := public.get_ai_credit_status();
  _status := _st->>'status'; _tier := _st->>'tier';
  _used := (_st->>'used')::int; _limit := (_st->>'limit')::int;

  SELECT EXISTS(SELECT 1 FROM public.tender_analysis
                 WHERE user_id=_uid AND tender_id=_tender_id) INTO _already;

  IF _status = 'trial' THEN
    IF _already THEN
      RETURN jsonb_build_object('allowed',true,'unlimited',false,'tier',_tier,
        'used',_used,'limit',5,'remaining',GREATEST(0,5-_used),'already_consumed',true);
    END IF;
    IF _used >= 5 THEN
      RETURN jsonb_build_object('allowed',false,'unlimited',false,'tier',_tier,
        'used',_used,'limit',5,'remaining',0,'already_consumed',false,'reason','trial_limit');
    END IF;
    UPDATE public.user_preferences SET trial_ai_analyses_used=_used+1, updated_at=now()
     WHERE user_id=_uid;
    RETURN jsonb_build_object('allowed',true,'unlimited',false,'tier',_tier,
      'used',_used+1,'limit',5,'remaining',5-(_used+1),'already_consumed',false);
  END IF;

  IF _status <> 'active' OR _limit <= 0 THEN
    RETURN jsonb_build_object('allowed',false,'unlimited',false,'tier',_tier,
      'used',_used,'limit',_limit,'remaining',0,'already_consumed',false,'reason','no_ai_access');
  END IF;

  IF _already THEN
    RETURN jsonb_build_object('allowed',true,'unlimited',false,'tier',_tier,
      'used',_used,'limit',_limit,'remaining',GREATEST(0,_limit-_used),'already_consumed',true);
  END IF;

  IF _used >= _limit THEN
    RETURN jsonb_build_object('allowed',false,'unlimited',false,'tier',_tier,
      'used',_used,'limit',_limit,'remaining',0,'already_consumed',false,'reason','ai_quota_exceeded');
  END IF;

  RETURN jsonb_build_object('allowed',true,'unlimited',false,'tier',_tier,
    'used',_used+1,'limit',_limit,'remaining',_limit-(_used+1),'already_consumed',false);
END; $$;

-- 6) Spotreba kreditu – granty
CREATE OR REPLACE FUNCTION public.consume_ai_credit_grant(_grant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _st jsonb; _status text; _tier text; _used int; _limit int; _already boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _st := public.get_ai_credit_status();
  _status := _st->>'status'; _tier := _st->>'tier';
  _used := (_st->>'used')::int; _limit := (_st->>'limit')::int;

  SELECT EXISTS(SELECT 1 FROM public.grant_analysis
                 WHERE user_id=_uid AND grant_id=_grant_id) INTO _already;

  IF _status = 'trial' THEN
    IF _already THEN
      RETURN jsonb_build_object('allowed',true,'unlimited',false,'tier',_tier,
        'used',_used,'limit',5,'remaining',GREATEST(0,5-_used),'already_consumed',true);
    END IF;
    IF _used >= 5 THEN
      RETURN jsonb_build_object('allowed',false,'unlimited',false,'tier',_tier,
        'used',_used,'limit',5,'remaining',0,'already_consumed',false,'reason','trial_limit');
    END IF;
    UPDATE public.user_preferences SET trial_ai_analyses_used=_used+1, updated_at=now()
     WHERE user_id=_uid;
    RETURN jsonb_build_object('allowed',true,'unlimited',false,'tier',_tier,
      'used',_used+1,'limit',5,'remaining',5-(_used+1),'already_consumed',false);
  END IF;

  IF _status <> 'active' OR _limit <= 0 THEN
    RETURN jsonb_build_object('allowed',false,'unlimited',false,'tier',_tier,
      'used',_used,'limit',_limit,'remaining',0,'already_consumed',false,'reason','no_ai_access');
  END IF;

  IF _already THEN
    RETURN jsonb_build_object('allowed',true,'unlimited',false,'tier',_tier,
      'used',_used,'limit',_limit,'remaining',GREATEST(0,_limit-_used),'already_consumed',true);
  END IF;

  IF _used >= _limit THEN
    RETURN jsonb_build_object('allowed',false,'unlimited',false,'tier',_tier,
      'used',_used,'limit',_limit,'remaining',0,'already_consumed',false,'reason','ai_quota_exceeded');
  END IF;

  RETURN jsonb_build_object('allowed',true,'unlimited',false,'tier',_tier,
    'used',_used+1,'limit',_limit,'remaining',_limit-(_used+1),'already_consumed',false);
END; $$;

-- 7) Admin: tier 'komplet' + obdobie
CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  _user_id uuid, _status text, _valid_until timestamptz, _note text,
  _source text, _tier text DEFAULT 'basic', _period text DEFAULT 'monthly')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _admin uuid := auth.uid();
BEGIN
  IF NOT public.has_role(_admin, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _status NOT IN ('trial','active','expired') THEN RAISE EXCEPTION 'invalid status'; END IF;
  IF _source NOT IN ('trial','paid','manual') THEN RAISE EXCEPTION 'invalid source'; END IF;
  IF _tier NOT IN ('basic','premium','komplet') THEN RAISE EXCEPTION 'invalid tier'; END IF;
  IF _period NOT IN ('monthly','yearly') THEN RAISE EXCEPTION 'invalid period'; END IF;

  INSERT INTO public.user_preferences (
    user_id, subscription_status, subscription_valid_until,
    subscription_note, subscription_source, subscription_tier,
    billing_period, ai_quota_period_start, updated_at)
  VALUES (_user_id, _status, _valid_until, _note, _source, _tier, _period, now(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET subscription_status = EXCLUDED.subscription_status,
        subscription_valid_until = EXCLUDED.subscription_valid_until,
        subscription_note = EXCLUDED.subscription_note,
        subscription_source = EXCLUDED.subscription_source,
        subscription_tier = EXCLUDED.subscription_tier,
        billing_period = EXCLUDED.billing_period,
        ai_quota_period_start = COALESCE(public.user_preferences.ai_quota_period_start, now()),
        updated_at = now();

  INSERT INTO public.subscription_admin_log (admin_id, user_id, action, status, valid_until, note)
  VALUES (_admin, _user_id, 'set', _status, _valid_until,
          COALESCE(_note,'') || ' [tier=' || _tier || ', period=' || _period || ']');

  RETURN jsonb_build_object('ok', true);
END; $$;

-- 8) Admin zoznam používateľov + obdobie
DROP FUNCTION IF EXISTS public.admin_list_users(integer);
CREATE OR REPLACE FUNCTION public.admin_list_users(_limit integer DEFAULT 200)
RETURNS TABLE(user_id uuid, email text, created_at timestamptz, subscription_status text,
              subscription_source text, subscription_tier text, subscription_note text,
              billing_period text, trial_started_at timestamptz,
              subscription_valid_until timestamptz, radars_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
         COALESCE((SELECT COUNT(*)::int FROM public.user_radars r WHERE r.user_id=u.id),0)
  FROM auth.users u
  LEFT JOIN public.user_preferences up ON up.user_id=u.id
  ORDER BY u.created_at DESC
  LIMIT GREATEST(_limit,1);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_subscription(uuid,text,timestamptz,text,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ai_monthly_limit(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_credit_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_ai_credit(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_ai_credit_grant(uuid) FROM anon;