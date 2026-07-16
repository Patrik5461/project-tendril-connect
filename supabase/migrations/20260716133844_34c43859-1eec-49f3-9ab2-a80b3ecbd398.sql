
-- 1) company_profile: one row per user
CREATE TABLE public.company_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ico TEXT,
  dic TEXT,
  nazov TEXT,
  adresa TEXT,
  psc TEXT,
  mesto TEXT,
  kraj TEXT,
  pravna_forma TEXT,
  datum_vzniku DATE,
  sk_nace_code TEXT,
  sk_nace_name TEXT,
  velkost_kategoria TEXT,
  -- structured yearly data: [{"rok":2023,"obrat":1234567,"zamestnanci":25}, ...]
  financne_roky JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- references: [{"nazov":"...","obstaravatel":"...","hodnota":123,"rok":2022,"popis":"..."}]
  referencie JSONB NOT NULL DEFAULT '[]'::jsonb,
  certifikaty TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  technicke_vybavenie TEXT,
  kluc_odbornici TEXT,
  doplnkove_info TEXT,
  auto_data JSONB,                       -- raw payload from RPO + registeruz
  auto_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_profile TO authenticated;
GRANT ALL ON public.company_profile TO service_role;
ALTER TABLE public.company_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own company profile" ON public.company_profile
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER company_profile_touch BEFORE UPDATE ON public.company_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) tender_analysis: per (user, tender)
CREATE TABLE public.tender_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tender_id UUID NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  summary TEXT,
  requirements JSONB,
  eligibility JSONB,
  overall TEXT,
  recommendation TEXT,           -- 'recommend' | 'caution' | 'skip'
  model_versions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tender_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tender_analysis TO authenticated;
GRANT ALL ON public.tender_analysis TO service_role;
ALTER TABLE public.tender_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tender analyses" ON public.tender_analysis
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tender_analysis_touch BEFORE UPDATE ON public.tender_analysis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX tender_analysis_user_idx ON public.tender_analysis (user_id, created_at DESC);

-- 3) SK-NACE code list (loaded separately via insert tool later)
CREATE TABLE public.sk_nace (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_code TEXT
);
GRANT SELECT ON public.sk_nace TO authenticated, anon;
GRANT ALL ON public.sk_nace TO service_role;
ALTER TABLE public.sk_nace ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SK-NACE readable to everyone" ON public.sk_nace
  FOR SELECT TO authenticated, anon USING (true);
