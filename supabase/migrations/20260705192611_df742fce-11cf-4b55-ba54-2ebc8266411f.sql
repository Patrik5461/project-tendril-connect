
-- user_preferences
CREATE TABLE public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  cpv_codes TEXT[] NOT NULL DEFAULT '{}',
  regions TEXT[] NOT NULL DEFAULT '{}',
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own preferences" ON public.user_preferences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- tenders
CREATE TABLE public.tenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  contracting_authority TEXT NOT NULL,
  description TEXT NOT NULL,
  cpv_code TEXT NOT NULL,
  region TEXT NOT NULL,
  deadline DATE NOT NULL,
  published_at DATE NOT NULL,
  source_url TEXT NOT NULL,
  estimated_value NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tenders TO authenticated;
GRANT ALL ON public.tenders TO service_role;

ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tenders" ON public.tenders
  FOR SELECT TO authenticated USING (true);

-- update trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenders_updated_at
  BEFORE UPDATE ON public.tenders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- auto-create preferences on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- seed 15 sample tenders
INSERT INTO public.tenders (title, contracting_authority, description, cpv_code, region, deadline, published_at, source_url, estimated_value) VALUES
('Rekonštrukcia základnej školy', 'Mesto Bratislava', 'Kompletná rekonštrukcia budovy základnej školy vrátane zateplenia a výmeny okien.', '45000000', 'Bratislavský kraj', CURRENT_DATE + 5, CURRENT_DATE - 2, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 850000),
('Výstavba cyklotrasy', 'Mesto Košice', 'Výstavba novej cyklotrasy v dĺžke 4 km vrátane osvetlenia.', '45233162', 'Košický kraj', CURRENT_DATE + 20, CURRENT_DATE - 5, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 420000),
('Dodávka a implementácia CRM systému', 'Ministerstvo financií SR', 'Dodávka softvéru pre riadenie vzťahov so zákazníkmi vrátane školenia.', '48000000', 'Bratislavský kraj', CURRENT_DATE + 30, CURRENT_DATE - 3, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 250000),
('IT infraštruktúra pre nemocnicu', 'Univerzitná nemocnica Martin', 'Modernizácia serverovej infraštruktúry a zálohovanie dát.', '48800000', 'Žilinský kraj', CURRENT_DATE + 4, CURRENT_DATE - 10, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 180000),
('Vývoj mobilnej aplikácie pre občanov', 'Mesto Nitra', 'Vývoj mobilnej aplikácie pre komunikáciu občanov s mestom.', '72000000', 'Nitriansky kraj', CURRENT_DATE + 45, CURRENT_DATE - 1, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 95000),
('Upratovacie služby pre úrady', 'Okresný úrad Prešov', 'Pravidelné upratovanie kancelárskych priestorov po dobu 24 mesiacov.', '90910000', 'Prešovský kraj', CURRENT_DATE + 15, CURRENT_DATE - 4, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 120000),
('Upratovanie v školských zariadeniach', 'Trnavský samosprávny kraj', 'Zabezpečenie upratovania v 12 stredných školách.', '90919300', 'Trnavský kraj', CURRENT_DATE + 6, CURRENT_DATE - 8, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 320000),
('Autobusová doprava pre žiakov', 'Obec Liptovský Mikuláš', 'Zabezpečenie školskej autobusovej dopravy na obdobie 3 rokov.', '60130000', 'Žilinský kraj', CURRENT_DATE + 25, CURRENT_DATE - 2, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 480000),
('Nákup elektrobusov MHD', 'Dopravný podnik Bratislava', 'Dodávka 10 kusov nízkopodlažných elektrobusov pre MHD.', '34121400', 'Bratislavský kraj', CURRENT_DATE + 60, CURRENT_DATE - 7, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 5200000),
('Údržba cestných komunikácií', 'Správa ciest TSK', 'Zimná a letná údržba ciest II. a III. triedy.', '45233141', 'Trenčiansky kraj', CURRENT_DATE + 3, CURRENT_DATE - 12, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 1100000),
('Nákup zdravotníckych pomôcok', 'Nemocnica Banská Bystrica', 'Dodávka jednorazových zdravotníckych pomôcok na 12 mesiacov.', '33140000', 'Banskobystrický kraj', CURRENT_DATE + 10, CURRENT_DATE - 3, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 280000),
('CT prístroj pre nemocnicu', 'Fakultná nemocnica Trnava', 'Dodávka a inštalácia moderného CT prístroja.', '33115000', 'Trnavský kraj', CURRENT_DATE + 40, CURRENT_DATE - 6, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 890000),
('Lieky pre lekárne', 'Nemocnica Prešov', 'Rámcová dohoda na dodávku liekov na 24 mesiacov.', '33600000', 'Prešovský kraj', CURRENT_DATE + 18, CURRENT_DATE - 4, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 1500000),
('Rekonštrukcia mostu', 'Slovenská správa ciest', 'Kompletná rekonštrukcia cestného mostu vrátane statiky.', '45221111', 'Košický kraj', CURRENT_DATE + 50, CURRENT_DATE - 5, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 2100000),
('Softvér pre správu registratúry', 'Ministerstvo vnútra SR', 'Dodávka a implementácia systému elektronickej registratúry.', '48311000', 'Bratislavský kraj', CURRENT_DATE + 35, CURRENT_DATE - 2, 'https://www.uvo.gov.sk/vyhladavanie-zakaziek', 340000);
