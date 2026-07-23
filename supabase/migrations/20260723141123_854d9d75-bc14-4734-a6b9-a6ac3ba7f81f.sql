
-- 1) user_grant_radars
CREATE TABLE IF NOT EXISTS public.user_grant_radars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Môj grantový radar',
  keywords text[] NOT NULL DEFAULT '{}',
  applicant_categories text[] NOT NULL DEFAULT '{}', -- podnikatelia | verejny | neziskovky
  programs text[] NOT NULL DEFAULT '{}',
  regions text[] NOT NULL DEFAULT '{}',              -- SK region names; empty = anywhere
  suma_eu_min numeric,
  suma_eu_max numeric,
  formats text[] NOT NULL DEFAULT '{}',              -- rolling | oneshot; empty = both
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_grant_radars TO authenticated;
GRANT ALL ON public.user_grant_radars TO service_role;

ALTER TABLE public.user_grant_radars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own grant radars"
  ON public.user_grant_radars FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_grant_radars_user_idx ON public.user_grant_radars (user_id);

CREATE TRIGGER user_grant_radars_updated_at
  BEFORE UPDATE ON public.user_grant_radars
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) sent_grant_notifications (dedup)
CREATE TABLE IF NOT EXISTS public.sent_grant_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  grant_id uuid NOT NULL,
  kind text NOT NULL, -- new_match | deadline_3 | deadline_1 | weekly
  extra text,          -- e.g. ISO week for 'weekly'
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, grant_id, kind, extra)
);

GRANT SELECT ON public.sent_grant_notifications TO authenticated;
GRANT ALL ON public.sent_grant_notifications TO service_role;

ALTER TABLE public.sent_grant_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own grant notif log"
  ON public.sent_grant_notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS sent_grant_notifications_user_idx
  ON public.sent_grant_notifications (user_id, kind, sent_at DESC);

-- 3) user_preferences new columns
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS grant_new_match_notifications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS grant_weekly_digest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grant_deadline_reminders boolean NOT NULL DEFAULT true;

-- 4) Helper: classify one applicant name
CREATE OR REPLACE FUNCTION public.grant_classify_applicant(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _name IS NULL THEN NULL
    -- podnikatelia
    WHEN _name IN (
      'Akciová spoločnosť','Spoločnosť s ručením obmedzeným','Komanditná spoločnosť',
      'Verejná obchodná spoločnosť','Jednoduchá spoločnosť na akcie','Družstvo','Iné družstvo',
      'Európska spoločnosť','Európske družstvo','Európske zoskupenie hospodárskych záujmov',
      'Spoločný podnik',
      'Odštepný závod alebo iná organizačná zložka podniku zapisujúca sa do obchodného registra',
      'Podnik alebo hospodárske zariadenie združenia',
      'Zahraničná osoba, právnická osoba so sídlom mimo územia SR',
      'Zahraničná osoba, fyzická osoba s bydliskom mimo územia SR'
    ) THEN 'podnikatelia'
    WHEN _name ~* '^Podnikateľ-' OR _name ~* 'hospodáriaci roľník'
      OR _name ~* '^Slobodné povolanie' OR _name ~* '^Fyzická osoba-príležitostne činná'
      THEN 'podnikatelia'
    -- verejny
    WHEN _name IN (
      'Rozpočtová organizácia','Príspevková organizácia',
      'Obec (obecný úrad), mesto (mestský úrad)','Samosprávny kraj (úrad samosprávneho kraja)',
      'Štátny podnik','Verejnoprávna inštitúcia','Iná organizácia verejnej správy',
      'Verejná výskumná inštitúcia','Banka-štátny peňažný ústav','Národná banka Slovenska',
      'Sociálna a zdravotné poisťovne','Európske zoskupenie územnej spolupráce',
      'Zastupiteľské orgány iných štátov','Zastúpenie zahraničnej právnickej osoby',
      'Miestna jednotka bez právnej spôsobilosti','Komora (s výnimkou profesných komôr)',
      'Komoditná burza','Doplnková dôchodková poisťovňa','Fondy'
    ) THEN 'verejny'
    -- neziskovky
    WHEN _name IN (
      'Nezisková organizácia','Nezisková organizácia poskytujúca všeobecne prospešné služby',
      'Nadácia','Neinvestičný fond','Cirkevná organizácia',
      'Združenie (zväz, spolok, spoločnosť, klub ai.)','Záujmové združenie právnických osôb',
      'Záujmové združenie fyzických osôb bez právnej spôsobilosti','Záujmové združenie',
      'Organizačná jednotka združenia','Stavovská organizácia - profesná komora',
      'Politická strana, politické hnutie','Spoločenstvá vlastníkov pozemkov, bytov a pod.',
      'Pozemkové spoločenstvo','Poľovnícka organizácia','Medzinárodné organizácie a združenia',
      'Zahraničné kultúrne, informačné stredisko, rozhlasová, tlačová a televízna agentúra'
    ) THEN 'neziskovky'
    ELSE NULL
  END;
$$;

-- Categories present in a grant's opravneny_ziadatel jsonb
CREATE OR REPLACE FUNCTION public.grant_applicant_categories(_opravneny jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT c), '{}')
  FROM (
    SELECT public.grant_classify_applicant(item->>'nazov') AS c
    FROM jsonb_array_elements(COALESCE(_opravneny, '[]'::jsonb)) item
  ) x
  WHERE c IS NOT NULL;
$$;

-- Extract region names from miesto_realizacie jsonb (array of strings or objects with .nazov)
CREATE OR REPLACE FUNCTION public.grant_region_names(_miesto jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT n), '{}')
  FROM (
    SELECT CASE
      WHEN jsonb_typeof(item) = 'string' THEN item #>> '{}'
      ELSE COALESCE(item->>'nazov', item->>'name')
    END AS n
    FROM jsonb_array_elements(COALESCE(_miesto, '[]'::jsonb)) item
  ) x
  WHERE n IS NOT NULL AND n <> '';
$$;

CREATE OR REPLACE FUNCTION public.grant_is_nationwide(_miesto jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH names AS (SELECT unnest(public.grant_region_names(_miesto)) AS n)
  SELECT
    (SELECT count(*) FROM names) >= 8
    OR EXISTS (SELECT 1 FROM names WHERE lower(n) LIKE '%slovensk%')
    OR EXISTS (SELECT 1 FROM names WHERE upper(n) IN ('SK','SK0'));
$$;

-- 5) Matcher for one radar (returns open grant_calls)
CREATE OR REPLACE FUNCTION public.match_grants_for_radar(_radar_id uuid)
RETURNS SETOF public.grant_calls
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (
    SELECT * FROM public.user_grant_radars WHERE id = _radar_id AND active
  )
  SELECT g.*
  FROM public.grant_calls g, r
  WHERE g.stav = 'OTVORENA'
    AND (g.deadline IS NULL OR g.deadline >= now())
    -- keywords
    AND (
      COALESCE(array_length(r.keywords, 1), 0) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(r.keywords) kw
        WHERE public.unaccent(lower(
                COALESCE(g.title,'') || ' ' || COALESCE(g.zameranie,'')
              )) LIKE '%' || public.unaccent(lower(kw)) || '%'
      )
    )
    -- applicant categories
    AND (
      COALESCE(array_length(r.applicant_categories, 1), 0) = 0
      OR public.grant_applicant_categories(g.opravneny_ziadatel) && r.applicant_categories
    )
    -- programs
    AND (
      COALESCE(array_length(r.programs, 1), 0) = 0
      OR g.program = ANY(r.programs)
    )
    -- regions (nationwide grants match every region selection)
    AND (
      COALESCE(array_length(r.regions, 1), 0) = 0
      OR public.grant_is_nationwide(g.miesto_realizacie)
      OR public.grant_region_names(g.miesto_realizacie) && r.regions
    )
    -- suma_eu range
    AND (r.suma_eu_min IS NULL OR COALESCE(g.suma_eu, 0) >= r.suma_eu_min)
    AND (r.suma_eu_max IS NULL OR COALESCE(g.suma_eu, 0) <= r.suma_eu_max)
    -- format
    AND (
      COALESCE(array_length(r.formats, 1), 0) = 0
      OR (g.deadline IS NULL AND 'rolling' = ANY(r.formats))
      OR (g.deadline IS NOT NULL AND 'oneshot' = ANY(r.formats))
    );
$$;

-- distinct programs helper (for UI select)
CREATE OR REPLACE FUNCTION public.list_grant_programs()
RETURNS TABLE(program text, cnt integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT program, COUNT(*)::int
  FROM public.grant_calls
  WHERE program IS NOT NULL AND program <> ''
  GROUP BY program
  ORDER BY 2 DESC;
$$;
