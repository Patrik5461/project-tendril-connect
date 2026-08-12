-- Viac firiem na používateľa.
--
-- company_profile mal doteraz user_id ako primárny kľúč, čiže presne jednu
-- firmu na účet. Zavádzame vlastné id a príznak is_default: kód, ktorý sa pýta
-- „aká je firma tohto používateľa" (AI analýzy, poddodávky, predvolená
-- kategória žiadateľa pri grantoch), pracuje s hlavnou firmou.

-- 1) id ako nový primárny kľúč -----------------------------------------------
ALTER TABLE public.company_profile
  ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.company_profile DROP CONSTRAINT company_profile_pkey;
ALTER TABLE public.company_profile ADD CONSTRAINT company_profile_pkey PRIMARY KEY (id);
ALTER TABLE public.company_profile ALTER COLUMN user_id SET NOT NULL;

-- 2) hlavná firma -------------------------------------------------------------
ALTER TABLE public.company_profile
  ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT false;

-- Doterajšie riadky sú jediná firma daného používateľa, teda automaticky hlavná.
UPDATE public.company_profile SET is_default = true;

-- Najviac jedna hlavná firma na používateľa. Čiastočný index preto, aby
-- nehlavné riadky medzi sebou nekolidovali.
CREATE UNIQUE INDEX company_profile_one_default_idx
  ON public.company_profile (user_id) WHERE is_default;

CREATE INDEX company_profile_user_idx
  ON public.company_profile (user_id, created_at);

-- 3) Vždy existuje práve jedna hlavná firma ----------------------------------

-- Prvá pridaná firma sa stáva hlavnou, nech používateľ nemusí nič nastavovať.
CREATE OR REPLACE FUNCTION public.company_profile_first_is_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.company_profile WHERE user_id = NEW.user_id
  ) THEN
    NEW.is_default := true;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER company_profile_first_default
  BEFORE INSERT ON public.company_profile
  FOR EACH ROW EXECUTE FUNCTION public.company_profile_first_is_default();

-- Po zmazaní hlavnej firmy povýšime najstaršiu zvyšnú, inak by používateľ
-- ostal s firmami, ale bez hlavnej, a analýzy by hlásili chýbajúci profil.
CREATE OR REPLACE FUNCTION public.company_profile_promote_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.is_default THEN
    UPDATE public.company_profile SET is_default = true
     WHERE id = (
       SELECT id FROM public.company_profile
        WHERE user_id = OLD.user_id
        ORDER BY created_at
        LIMIT 1
     );
  END IF;
  RETURN OLD;
END; $$;

CREATE TRIGGER company_profile_promote_default
  AFTER DELETE ON public.company_profile
  FOR EACH ROW EXECUTE FUNCTION public.company_profile_promote_default();

-- 4) Prepnutie hlavnej firmy --------------------------------------------------
-- Musí ísť cez funkciu: čiastočný unique index by pri obyčajnom UPDATE
-- na is_default=true kolidoval s doterajšou hlavnou firmou.
CREATE OR REPLACE FUNCTION public.set_default_company(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.company_profile
     WHERE id = _company_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  UPDATE public.company_profile SET is_default = false
   WHERE user_id = auth.uid() AND is_default AND id <> _company_id;

  UPDATE public.company_profile SET is_default = true
   WHERE id = _company_id AND user_id = auth.uid();
END; $$;

REVOKE ALL ON FUNCTION public.set_default_company(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_company(UUID) TO authenticated;

-- 5) Admin prehľad ------------------------------------------------------------
-- Bez podmienky na is_default by join zduplikoval používateľa za každú firmu.
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
  LEFT JOIN public.company_profile cp ON cp.user_id=u.id AND cp.is_default
  ORDER BY u.created_at DESC
  LIMIT GREATEST(_limit,1);
END; $function$;
