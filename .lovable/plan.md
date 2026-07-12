## Cieľ

Automaticky generované SEO landing stránky, ktoré chytajú organickú návštevnosť z Google na frázy typu „stavebné zákazky Bratislava". Verejné (bez prihlásenia), s AI-generovaným úvodným textom uloženým v DB a reálnym zoznamom aktuálnych zákaziek.

## 1. URL štruktúra

- `/zakazky/kategoria/{kategoria-slug}` — napr. `/zakazky/kategoria/stavebne-prace`
- `/zakazky/kategoria/{kategoria-slug}/{kraj-slug}` — napr. `/zakazky/kategoria/stavebne-prace/bratislavsky-kraj`
- `/zakazky/kraj/{kraj-slug}` — napr. `/zakazky/kraj/kosicky-kraj`

Poznámka: pridám `/kategoria/` do cesty aby sa oddelilo od `/zakazky/{id}` (existujúca detail route `zakazka.$id.tsx` — táto je iná, ale prefix `kategoria`/`kraj` predchádza kolíziám).

Route súbory (TanStack Start, file-based):
- `src/routes/zakazky.kategoria.$kategoria.tsx`
- `src/routes/zakazky.kategoria.$kategoria.$kraj.tsx`
- `src/routes/zakazky.kraj.$kraj.tsx`

## 2. Databáza — nová tabuľka `seo_pages`

Stĺpce (okrem štandardných id/created_at/updated_at):
- `page_type` text — `category` | `category_region` | `region`
- `category_slug` text nullable — napr. `stavebne-prace`
- `cpv_prefix` text nullable — 2-miestny CPV divízny kód (napr. `45`)
- `region_slug` text nullable — napr. `bratislavsky-kraj`
- `region_name` text nullable — napr. `Bratislavský kraj`
- `h1` text — nadpis
- `title` text — meta title
- `description` text — meta description (max 155)
- `intro_text` text — AI generovaný úvod (2–3 vety)
- `active_tenders_count` int — cache pre triedenie/filter
- `last_generated_at` timestamptz
- unique index na (page_type, category_slug, region_slug)

RLS: verejný SELECT (`TO anon, authenticated`), zápis len service_role. GRANT SELECT to anon, authenticated.

## 3. Katalógy

`src/lib/seo-catalog.ts` — 12 kurátorovaných kategórií (subset z `CPV_DIVISIONS`) s ľudským menom + slug + CPV prefix:

```
stavebne-prace           → 45
it-sluzby                → 72
zdravotnicke-zariadenia  → 33
doprava                  → 60
upratovanie              → 90
potraviny                → 15
energie                  → 09
kancelarska-technika     → 30
stavebne-materialy       → 44
architektonicke-sluzby   → 71
poradenske-sluzby        → 79
vzdelavanie              → 80
```

8 krajov + „celé Slovensko" (slug `celé-slovensko` → `cele-slovensko`).

## 4. Generovanie stránok

Server function `generateSeoPages` (admin-only, `has_role admin`):

1. Pre každú kategóriu spočítaj aktívne zákazky v celom SK. Ak ≥ 3 → vytvor `page_type='category'`.
2. Pre každý kraj spočítaj aktívne zákazky. Ak ≥ 3 → vytvor `page_type='region'`.
3. Pre každú kombináciu kategória × kraj spočítaj. Ak ≥ 3 → vytvor `page_type='category_region'`.
4. Pre každú novú (alebo pri re-generácii) volaj Lovable AI Gateway `google/gemini-2.5-flash-lite` s promptom v SK → vygeneruj `h1`, `title` (≤60), `description` (≤155), `intro_text` (2–3 vety). Uloží sa do `seo_pages`.
5. Upsert cez unique index.

RPC `get_seo_tenders(category_prefix, region_name, limit)` (SECURITY DEFINER) — vracia top 20 aktívnych zákaziek pre stránku. Filter: `deadline >= now() OR (deadline IS NULL AND published_at >= now() - 30 days)`; ak `cpv_prefix` → `cpv_code LIKE prefix||'%'`; ak `region_name` a nie je „Celé Slovensko" → `region = region_name AND country = 'SK'`; inak SK všeobecne pri region-only stránke.

## 5. Stránka (verejná)

Loader (SSR) — nevolá `requireSupabaseAuth`, používa publishable server client:
- Načíta `seo_pages` riadok podľa slugu (404 ak neexistuje).
- Načíta zoznam zákaziek cez `get_seo_tenders`.
- Načíta zoznam súvisiacich kategórií/krajov (pre interné prelinkovanie).

Komponenty:
- H1 (z DB)
- Krátky úvodný text (`intro_text`)
- Počet aktívnych: „Aktuálne {N} aktívnych zákaziek"
- Zoznam max 20 zákaziek — každá s `<Link to="/zakazka/$id">` (title, obstarávateľ, deadline, hodnota, kraj)
- Prázdny stav: „Aktuálne žiadne aktívne — nastavte si radar a dostávajte emailom, keď pribudnú."
- CTA blok: „Chcete tieto zákazky dostávať e-mailom? Zaregistrujte sa zadarmo (2 mesiace zdarma)." — button na `/auth`
- Súvisiace stránky: 6–8 interných linkov (iné kategórie v tom kraji, iné kraje pre túto kategóriu, hlavná kategória)

`head()` — `title`, `description` z DB; `og:title`, `og:description`, `og:type=website`; canonical relatívna.

## 6. Admin sekcia

Do `/admin` pridám nový tab „SEO":
- Zoznam všetkých `seo_pages` (page_type, slug, počet aktívnych, last_generated_at, náhľad title).
- Tlačidlo „Vygenerovať všetky" — spúšťa `generateSeoPages` (batch, s progress feedbackom vo forme toastu).
- Tlačidlo „Pregenerovať texty" na riadku — pre jednu stránku znova AI.
- Edit modal — možnosť ručne prepísať `h1`, `title`, `description`, `intro_text`.
- Filter podľa page_type.

Server functions v `src/lib/seo.functions.ts`:
- `listSeoPages` (admin)
- `generateSeoPages` (admin) — hromadné
- `regenerateSeoPage(id)` (admin)
- `updateSeoPage(id, patch)` (admin)

## 7. Sitemap

Nová route `src/routes/sitemap[.]xml.ts` (server route). Buduje sa dynamicky:
- statické stránky: `/`, `/cennik`, `/kontakt`, `/pravne/*`, `/ochrana-osobnych-udajov`
- všetky `seo_pages` z DB
- Content-Type `application/xml`, `Cache-Control: public, max-age=3600`

`public/robots.txt` — zabezpečím `Sitemap: https://www.tendrik.sk/sitemap.xml` a `Allow: /zakazky/`.

## 8. AI prompt (skrátene)

System: „Si SEO copywriter pre slovenský portál verejného obstarávania Tendrik. Píšeš stručne, vecne, bez marketingového bullshitu."

User: „Kategória: {name} (CPV {prefix}). Kraj: {region alebo 'celé Slovensko'}. Napíš JSON: h1 (max 70 znakov), title (max 60), description (max 155), intro_text (2–3 vety, ~40–60 slov, opíš pre koho sú tieto zákazky vhodné a čo sa obstaráva)."

Structured output cez `Output.object` + Zod schema. Fallback: ak AI zlyhá, ulož deterministické texty z template.

## 9. Rozsah / limity

- Odhad: ~12 kategórií + 9 krajov + ~100 kombinácií = ~120 stránok. Generovanie beží v pozadí, po dávkach po 10 (aby sa AI nevystrelilo do rate limitu).
- „Aspoň 3 aktívne zákazky" filter zabezpečí, že nevytvárame prázdne stránky.
- Cron/re-generácia: manuálne z adminu (na začiatok stačí). Neskôr sa dá pridať pg_cron.

## 10. Súbory (odhad)

Nové:
- migrácia (tabuľka `seo_pages` + RPC `get_seo_tenders`)
- `src/lib/seo-catalog.ts`
- `src/lib/seo.functions.ts`
- `src/routes/zakazky.kategoria.$kategoria.tsx`
- `src/routes/zakazky.kategoria.$kategoria.$kraj.tsx`
- `src/routes/zakazky.kraj.$kraj.tsx`
- `src/routes/sitemap[.]xml.ts`

Upravené:
- `src/routes/_authenticated/admin.tsx` (nový tab SEO)
- `public/robots.txt`
- prípadne `src/routes/index.tsx` (link „Prehľadať podľa kategórií")

## Poznámka pre používateľa

Model: použijem `google/gemini-2.5-flash-lite` cez Lovable AI Gateway (rýchly a lacný, ideálny na krátke texty). Po vytvorení tabuľky spustíte v admine „Vygenerovať všetky" — dávka ~120 stránok, trvá odhadom 2–3 minúty. Google typicky zaindexuje takéto stránky do 1–4 týždňov, výsledky v SERP záležia od kvality obsahu a interných linkov (obe máme pokryté).
