
CREATE TABLE public.grant_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  grant_id UUID NOT NULL REFERENCES public.grant_calls(id) ON DELETE CASCADE,
  summary TEXT,
  requirements JSONB,
  eligibility JSONB,
  overall TEXT,
  recommendation TEXT,
  model_versions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, grant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_analysis TO authenticated;
GRANT ALL ON public.grant_analysis TO service_role;

ALTER TABLE public.grant_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own grant analyses" ON public.grant_analysis
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_grant_analysis_updated_at
  BEFORE UPDATE ON public.grant_analysis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_grant_analysis_user ON public.grant_analysis(user_id);
CREATE INDEX idx_grant_analysis_grant ON public.grant_analysis(grant_id);

-- Credit consumption mirror for grants (shared 5-analysis trial pool)
CREATE OR REPLACE FUNCTION public.consume_ai_credit_grant(_grant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _status text; _tier text; _used int; _already boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT subscription_status,
         COALESCE(subscription_tier,'basic'),
         COALESCE(trial_ai_analyses_used,0)
    INTO _status, _tier, _used
  FROM public.user_preferences WHERE user_id = _uid;

  IF _status IS NULL THEN
    _status := 'trial'; _tier := 'basic'; _used := 0;
  END IF;

  IF _status = 'active' AND _tier = 'premium' THEN
    RETURN jsonb_build_object('allowed',true,'unlimited',true,'remaining',-1,'already_consumed',false);
  END IF;

  IF _status <> 'trial' THEN
    RETURN jsonb_build_object('allowed',false,'unlimited',false,'remaining',0,
                              'already_consumed',false,'reason','no_ai_access');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.grant_analysis
     WHERE user_id = _uid AND grant_id = _grant_id
  ) INTO _already;

  IF _already THEN
    RETURN jsonb_build_object('allowed',true,'unlimited',false,
                              'remaining',GREATEST(0,5-_used),'already_consumed',true);
  END IF;

  IF _used >= 5 THEN
    RETURN jsonb_build_object('allowed',false,'unlimited',false,'remaining',0,
                              'already_consumed',false,'reason','trial_limit');
  END IF;

  UPDATE public.user_preferences
     SET trial_ai_analyses_used = _used + 1, updated_at = now()
   WHERE user_id = _uid;

  RETURN jsonb_build_object('allowed',true,'unlimited',false,
                            'remaining',5-(_used+1),'already_consumed',false);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.consume_ai_credit_grant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_credit_grant(uuid) TO authenticated;
