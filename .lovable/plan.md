
# Prémiová AI „Analýza zákazky" – plán

Rozsah je veľký, tak to rozdelím do 3 fáz. Najprv urobíme **fázu 1 (diagnostiku registrov)**, ukážem ti výsledky a až potom pôjdeme ďalej. To zodpovedá tvojmu poslednému bodu – „najprv over, potom stavaj".

---

## Fáza 1 — Diagnostika slovenských registrov (urobím ako prvé)

Cieľ: zistiť, čo sa z IČO reálne dá automaticky vytiahnuť. Bez tohto by som staval naslepo.

Otestujem tieto zdroje z Node/servera (skript v `/tmp`, nie do projektu):

1. **RPO – Register právnických osôb (ŠÚ SR / statistics.sk)**
   - `https://api.statistics.sk/rpo/v1/search?identifier={ICO}` – overí, či ide o verejné REST API bez kľúča, aké polia vracia (názov, adresa, právna forma, predmety činnosti, dátum vzniku/zániku).
2. **ÚVO – RPO/register partnerov VS**
   - `https://www.uvo.gov.sk/…` – skúsim verejné endpointy (často to je len HTML), rozhodneme, či scrape má zmysel.
3. **FinStat / Register účtovných závierok (registeruz.sk)**
   - `https://www.registeruz.sk/cruz-public/api/…` – overím, či existuje verejné API pre účtovné závierky (obrat, výsledok hospodárenia, počet zamestnancov) podľa IČO.
4. **OR SR (orsr.sk)** – čisto HTML, len ako záloha ak RPO zlyhá.

Výstup fázy 1 (dostaneš do chatu):
- pre 2–3 reálne IČO tabuľku: **pole → zdroj → hodnota / „nedostupné programovo"**
- záver: čo pôjde automaticky, čo necháme na ručné doplnenie.

Až podľa toho dokončíme dizajn tabuľky `company_profile` a fetcher.

---

## Fáza 2 — Backend + firemný profil

### 2.1 Secrets a Gemini klient
- Pridám secret `GEMINI_API_KEY` (vyžiadam si od teba cez `add_secret`).
- `src/lib/gemini.server.ts` – tenký klient nad `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=…`, ošetrí 429 / 400 / 401 / 5xx s čitateľnou hláškou, retry len na 429/5xx.
- Konštanty modelov na jednom mieste:
  ```ts
  export const GEMINI_MODELS = {
    LITE:  "gemini-flash-lite-latest",   // existujúce zhrnutia
    FLASH: "gemini-flash-latest",        // detail + podmienky
    PRO:   "gemini-pro-latest",          // spôsobilosť
  }
  ```
  Aktuálne názvy si overím proti live API v tej istej fáze (list models endpoint) a prípadne opravím.

### 2.2 Migrácie
- `company_profile` (1 riadok na `user_id`): `ico`, `nazov`, `adresa`, `pravna_forma`, `predmety_cinnosti text[]`, `obrat_roky jsonb`, `zamestnanci int`, `referencie jsonb`, `certifikaty text[]`, `doplnkove_info text`, `auto_data jsonb` (raw z registrov), `updated_at`. RLS `auth.uid() = user_id`, GRANTy pre `authenticated` + `service_role`.
- `tender_analysis`: `(user_id, tender_id)` unique, `summary text`, `requirements jsonb`, `eligibility jsonb`, `overall text`, `model_versions jsonb`, `created_at`. RLS „vlastník".

### 2.3 Server funkcie (`createServerFn`, `requireSupabaseAuth`)
- `fetchCompanyByIco({ ico })` – volá registre z fázy 1, vráti normalizovaný objekt + čo sa nepodarilo.
- `saveCompanyProfile(...)` – upsert.
- `getCompanyProfile()`
- `analyzeTender({ tenderId })` – **len pre `subscription_status = 'active'`** (kontrola cez `user_preferences`). Načíta tender + profil, pošle 3 Gemini volania (FLASH, FLASH, PRO), uloží do `tender_analysis`, vráti. Ak už záznam existuje, len vráti (žiadne opakované generovanie).
- `getTenderAnalysis({ tenderId })`.

### 2.4 Existujúce zhrnutia
Nechám ako sú (edge function stále beží cez Lovable AI Gateway), lebo nová práca cez tvoj Gemini kľúč je len pre analýzu. Ak chceš, v ďalšej iterácii ich prepneme tiež na tvoj kľúč.

---

## Fáza 3 — Frontend

### 3.1 Firemný profil
- Nová route `src/routes/_authenticated/firma.tsx` (odkaz zo `settings`).
- Formulár: IČO + tlačidlo „Načítať z registrov" → volá `fetchCompanyByIco` → predvyplní polia (readonly + „upraviť"). Ručné polia: referencie (dynamický zoznam: názov, hodnota, rok), certifikáty (chips), technické/personálne vybavenie (textarea).
- Uloženie cez `saveCompanyProfile`.

### 3.2 Detail zákazky
V `src/routes/zakazka.$id.tsx` pridám sekciu „Analýza zákazky":
- Ak `subscription_status !== 'active'` → karta so zámkom + CTA na `/predplatne`.
- Ak nie je vyplnený profil → CTA „Doplň firemný profil" (link na `/firma`).
- Inak tlačidlo „Analyzovať zákazku" → volá `analyzeTender`, počas behu spinner s krokmi (súhrn → podmienky → spôsobilosť).
- Výsledok: 3 sekcie (Súhrn / Podmienky účasti / Analýza spôsobilosti s ✅⚠️❌ + celkové odporúčanie) + disclaimer.

---

## Čo urobím teraz

Iba **Fáza 1**: spustím diagnostický skript proti verejným registrom s 2–3 vzorovými IČO a nahlásim ti výsledky. Žiadne migrácie ani zmeny v projekte v tomto kroku. Po tvojom OK pokračujem fázou 2 a 3, a potom si vypýtam `GEMINI_API_KEY`.
