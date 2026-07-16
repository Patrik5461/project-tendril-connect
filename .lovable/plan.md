# Plán: Multijazyčnosť webu (SK, CS, EN, DE)

## Rozsah (podľa odpovedí)
- 4 jazyky: **SK** (default, bez prefixu), **CS** (`/cs/*`), **EN** (`/en/*`), **DE** (`/de/*`)
- Preložiť **všetko**: marketing + aplikácia (dashboard, nastavenia, onboarding, admin) + AI výstupy (analýza zákaziek, oslovenia, help chat)
- Preklady stringov: AI (Lovable AI Gateway, `google/gemini-3-flash-preview`) s ručnou kontrolou
- Dáta zo zákaziek (názvy, opisy z TED/ÚVO/EKS/JOSEPHINE) ostávajú v pôvodnom jazyku – prekladajú sa len keď to používateľ vyžiada v analýze

## Architektúra

### 1) i18n runtime
- `react-i18next` + `i18next` + `i18next-browser-languagedetector`
- Namespace-y: `common`, `marketing`, `legal`, `app`, `auth`, `dashboard`, `settings`, `admin`, `emails`
- Prekladové súbory: `src/i18n/locales/{sk,cs,en,de}/{namespace}.json`
- SSR-safe init (i18next inicializovaný v `src/router.tsx` na request, jazyk určený z URL prefixu)

### 2) URL routing
- Zavedieme **layout route** `src/routes/_lang.tsx` s dynamickým segmentom? Nie – TanStack file-based routing radšej cez **redirect + detect** v `__root.tsx`.
- Riešenie: `beforeLoad` v `__root.tsx` číta prefix z `location.pathname`:
  - `/cs/...` → `lang = cs`, interne routuje na zvyšok cesty
  - `/en/...`, `/de/...` analogicky
  - inak `lang = sk`
- Implementácia cez **splat prefix routes**: `src/routes/cs.$.tsx`, `en.$.tsx`, `de.$.tsx` ktoré prerendujú tú istú stránku s nastaveným jazykom v kontexte. **Alternatíva (čistejšia):** middleware v `__root.tsx` cez `useRouterState` + `I18nextProvider` prepínanie jazyka; URL prefix ostáva ako "visual" a všetky `<Link>` cez helper `localizedTo(path, lang)`.
- **Zvolený prístup:** kontext-based prepínanie jazyka + helper `useLocalizedLink()` a `useLang()`, prefix v URL zaručí SSR správny `<html lang>` a `hreflang` tagy. Reálne file-routing zostáva pôvodný; prefix sa parsuje v `__root.tsx` `beforeLoad` a jazyk ide do routerContextu.
  - **Poznámka:** Aby prefixované URL (`/en/cennik`) skutočne matchovali existujúce routes (`/cennik`), pridáme **rewrite** v `src/server.ts` – prichádzajúca cesta `/en/cennik` sa internally rewrite-uje na `/cennik` s hlavičkou `x-lang: en`. SSR aj klient potom vidia rovnakú route, len s iným jazykom v kontexte.

### 3) Prepínač jazyka
- Nový komponent `LanguageSwitcher` v hlavičkách (marketing + authenticated layout)
- Ukladá voľbu do cookie `NEXT_LOCALE` + presmeruje na prefixovanú URL
- Vlajky + kódy (SK/CS/EN/DE)

### 4) SEO
- `<html lang="{lang}">` v `__root.tsx`
- `hreflang` alternate linky per route v `head()` (SK, CS, EN, DE, x-default → SK)
- Canonical na aktuálnu jazykovú verziu
- Sitemap rozšírený o všetky 4 jazyky
- `robots.txt` bez zmeny

### 5) Preklad stringov
- **Extrakcia:** ručne prejdem existujúce komponenty a nahradím SK stringy za `t('namespace:key')`. Začnem od najviditeľnejších (index, cennik, kontakt, pravne, auth, dashboard, settings).
- **Generovanie prekladov:** skript `scripts/translate-i18n.ts` – vezme `sk/*.json` ako zdroj, cez Lovable AI Gateway vygeneruje `cs/*.json`, `en/*.json`, `de/*.json`. Spúšťané ručne po každom update SK.
- Prompt pre AI: zachovaj kľúče, tone-of-voice (formálny obchodný), placeholders `{{name}}`, HTML tagy.

### 6) AI výstupy (analýza, oslovenia, help chat)
- `tender-analysis.functions.ts`, `subcontracting.functions.ts`, `help-chat/index.ts`:
  - Do promptu Layer B/C pridáme `TARGET_LANGUAGE: {lang}` (odvodené z `Accept-Language` alebo z parametra requestu podľa aktuálneho jazyka UI)
  - Systémový prompt: „Odpovedaj v jazyku {lang_name}. Zachovaj odborné registrové termíny v origináli, ak preklad nie je jednoznačný."
  - Cache výstupov v DB rozšírime o `analysis_lang` stĺpec (migrácia), aby sa analýza nemusela regenerovať pri prepnutí jazyka späť

### 7) E-maily
- `welcome-email.ts`, `settings-email.ts`, `send-daily-digest`, `send-weekly-digest`, `send-deadline-reminders`, `send-settings-confirmation`, `gopay-webhook` (potvrdenia)
- Templaty pre 4 jazyky; jazyk používateľa uložený v `profiles.lang` (nová migrácia, default `sk`)
- Onboarding: pridáme krok „Jazyk komunikácie" (alebo auto z UI pri registrácii)

### 8) Právne texty
- Právne stránky (obchodné podmienky, GDPR, reklamačný poriadok, cookies, opakované platby) sú dlhé právnicky citlivé texty. **AI preloží draft, ale používateľ musí schváliť/upraviť pred publikáciou.** Označíme ich v prekladových súboroch ako `_draft: true`.

## Postup (fázy)

**Fáza 1 – Infraštruktúra** (žiadne user-visible zmeny)
- Nainštalovať `i18next`, `react-i18next`, `i18next-browser-languagedetector`
- Vytvoriť `src/i18n/config.ts`, `src/i18n/locales/sk/*.json` (prázdne namespaces)
- Zapojiť `I18nextProvider` v `__root.tsx`
- Rewrite v `src/server.ts` pre `/cs`, `/en`, `/de` prefixy
- `useLang()`, `useLocalizedLink()` hooks

**Fáza 2 – Prepínač + SEO kostra**
- `LanguageSwitcher` komponent v marketing + authenticated header
- `hreflang` + canonical logika v `head()` helper `buildI18nHead(path)`
- Sitemap update

**Fáza 3 – Extrakcia SK stringov + AI preklad**
- Prejsť routes v poradí: `index`, `cennik`, `kontakt`, `auth`, `objednavka`, `predplatne`, `pravne.*`, `ochrana-osobnych-udajov`, `_authenticated/*`, komponenty (`LegalFooter`, `SubcontractingSection`, `TenderAnalysisSection`, `HelpChatWidget`, `CookieBanner`, `SeoLandingPage`)
- Pre každú route: nahradiť stringy `t(...)`, pridať kľúče do `sk/*.json`
- Spustiť `translate-i18n.ts` → vygenerované `cs/en/de` súbory
- Ručná kontrola (spot-check najviditeľnejších obrazoviek)

**Fáza 4 – AI výstupy**
- Rozšíriť `analyzeTender`, `generateSubcontractingEmail`, `help-chat` o `lang` parameter
- Migrácia: `tender_analyses.lang`, `profiles.lang`
- Prompt update s pravidlom jazyka

**Fáza 5 – E-maily**
- 4 jazykové varianty templatov pre všetky odchádzajúce e-maily
- Onboarding krok „Jazyk komunikácie"

**Fáza 6 – QA**
- Prejsť každú stránku vo všetkých 4 jazykoch
- Skontrolovať hreflang, canonical, `<html lang>`
- E-mail preview vo všetkých jazykoch

## Odhad rozsahu
- ~40 komponentov/routes na extrakciu stringov
- ~8 namespace súborov × 4 jazyky = 32 JSON súborov
- ~1500-2000 prekladových kľúčov
- 2 migrácie (profiles.lang, tender_analyses.lang)
- Fáza 1+2 = základ, môžem spraviť teraz naraz. Fáza 3 (extrakcia) je najviac práce – urobím ju **incrementálne** (najprv marketing routes, potom app, potom právne).

## Otázka pred štartom
Fázy 1+2 (infraštruktúra + prepínač + SEO) urobím teraz naraz – bude viditeľná zmena: prepínač v hlavičkách, prefixy `/cs`, `/en`, `/de` fungujú, ale texty ostanú v SK (kým fáza 3 nedoplní preklady).

Potom fázy 3-5 pojdu postupne. Ak chceš, môžem začať extrahovať stringy hneď v tejto iterácii pre **index + cennik + kontakt** (najviditeľnejšie SEO stránky), aby si videl real preklady end-to-end.

**Potvrď:**
1. Prístup s rewrite-om URL prefixov v `src/server.ts` je OK? (alternatíva by bola duplikovať všetky route súbory s prefixmi – neodporúčam)
2. Začať fázou 1+2 (infra) + fázou 3 pre `index/cennik/kontakt` v tejto iterácii?
3. Právne texty: AI vygeneruje draft, ty schváliš pred „published" flagom – OK?