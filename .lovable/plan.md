
## Cieľ

Analogický monitoring pre grantové výzvy — vlastná tabuľka radarov, matching v DB, notifikácie s inou kadenciou než pri zákazkách. Dostupné v Základe aj Prémium (žiadny paywall).

## 1. Databáza

**Nová tabuľka `public.user_grant_radars`:**
- `name` (text)
- `keywords` (text[]) — hľadá v `nazov` + `popis` cez `unaccent`
- `applicant_categories` (text[]) — `podnikatelia | verejny | neziskovky | skoly` (reuse mapy z `src/lib/grant-applicant-categories.ts`)
- `programs` (text[]) — voliteľný filter na `program`
- `regions` (text[]) — s celoslovenskou logikou (výzva pokrývajúca celé SK matchne každý kraj)
- `suma_eu_min`, `suma_eu_max` (numeric, nullable)
- `format` (text[]) — `rolling | oneshot`
- `active` (boolean)
- RLS: user vlastní svoje záznamy; grants pre `authenticated` + `service_role`; `updated_at` trigger.

**Nové polia v `user_preferences`:**
- `grant_new_match_notifications` boolean default true
- `grant_weekly_digest` boolean default false
- `grant_deadline_reminders` boolean default true

**Nová tabuľka `public.sent_grant_notifications`:**
- `(user_id, grant_id, kind)` unique — `kind ∈ new_match | deadline_3 | deadline_1 | weekly`
- Použije sa na deduplikáciu (rovnaký vzor ako `sent_reminders`).

**Nová DB funkcia `public.match_grants_for_radar(_radar_id uuid) RETURNS SETOF grant_calls`:**
- Vracia otvorené grantové výzvy, ktoré sedia na kritériá radaru; reuse mapovaného zoznamu právnych foriem → kategórie.
- Celoslovenské výzvy sa priraďujú ku každému kraju.

## 2. Server functions (`src/lib/grant-radars.functions.ts`)

- `listGrantRadars` — pre nastavenia.
- `createGrantRadar` — predvyplní `applicant_categories` podľa právnej formy z `company_profile` (rovnaká mapa ako listing).
- `updateGrantRadar`, `deleteGrantRadar`, `toggleGrantRadar`.
- Všetky s `requireSupabaseAuth`, žiadny tier gate.

## 3. UI — `/nastavenia`

Nový tab **„Radary na granty"** vedľa existujúceho **„Radary"**. Karta radaru s poľami:
- kľúčové slová (chip input, ako u zákaziek)
- typ žiadateľa (multi checkbox: Podnikatelia · Samospráva · Neziskovky · Školy)
- program (multi-select z distinct programov v DB, načíta sa lazy)
- kraje (multi-select — reuse komponenty s krajmi SK + info „Celoslovenské výzvy zahrnuté automaticky")
- alokácia EÚ od–do (voliteľné)
- formát výzvy (rolling / oneshot — checkboxy)

Prepínače notifikácií (v tabe „Notifikácie" pod sekciou pre zákazky):
- „Upozornenie na novú zhodu (granty)"
- „Týždenný súhrn grantov (piatok)"
- „Pripomienka pred deadlinom (one-shot výzvy)"

## 4. Cron a notifikačné hooky

Existujúci ITMS sync beží o 01:30 UTC. Doplníme:

- `/api/public/hooks/grant-new-matches` — spúšťa sa o **02:00 UTC** (po syncu). Pre každý aktívny radar nájde nové výzvy (posledných 24 h, ktoré nie sú v `sent_grant_notifications` pre daný `(user, grant, 'new_match')`) a ak má user `grant_new_match_notifications`, pošle e-mail (max 1 e-mail so zoznamom zhôd, nie 1 na zhodu). Zapíše dedup záznam.
- `/api/public/hooks/grant-deadline-reminders` — piatok/utorok ráno o **07:00 UTC**. Pre one-shot výzvy (`deadline IS NOT NULL`) v okne 3 a 1 deň pošle pripomienku iba raz, dedup cez `kind='deadline_3'/'deadline_1'`.
- `/api/public/hooks/grant-weekly-digest` — piatok o **07:15 UTC**, ak má user zapnutý `grant_weekly_digest`. Deduplikácia cez `kind='weekly'` (unique per ISO týždeň v poznámke).

Všetky tri routy autentifikujú `apikey` header (Supabase anon key, rovnaký vzor ako existujúce hooky). E-maily posiela Resend cez `send-notification-email` (existujúci flow) — pridá sa nový template s vestníkovým štýlom, obálka rovnaká ako u zákaziek, ale s červenou lištou „NOVÁ GRANTOVÁ ZHODA / TÝŽDENNÝ SÚHRN / PRIPOMIENKA DEADLINE".

Rate limit: hooky sa vzájomne oneskoria (02:00 / 07:00 / 07:15), takže žiadne dva e-maily v tej istej minúte; navyše každý hook robí batching per user (jeden e-mail so zoznamom).

## 5. Cron zápisy (`supabase--insert` po nasadení route súborov)

```sql
select cron.schedule('grant-new-matches', '0 2 * * *', ...);
select cron.schedule('grant-deadline-reminders', '0 7 * * 2,5', ...);
select cron.schedule('grant-weekly-digest', '15 7 * * 5', ...);
```

## 6. Verification

Po implementácii:
- v UI nastavení pridám 1 radar (napr. „IT rozvoj — Podnikatelia — celé SK"),
- manuálne triggernem hook `curl -H "apikey: ..." .../grant-new-matches`,
- ukážem screenshot / HTML preview e-mailu s novou zhodou.

## Technical details

- Nový súbor: `src/lib/grant-radars.functions.ts`
- Nová route sekcia v `src/routes/_authenticated/settings.tsx` (tab + `GrantRadarCard`)
- Nové server routes: `src/routes/api/public/hooks/grant-new-matches.ts`, `grant-deadline-reminders.ts`, `grant-weekly-digest.ts`
- Shared helpery: `src/lib/grant-email-templates.ts` (HTML rendering)
- Migrácia: tabuľky, index, RLS, trigger, `match_grants_for_radar`, doplnenie stĺpcov v `user_preferences`
- Insert po nasadení: 3× `cron.schedule`

Odhadovaný rozsah: 1 migrácia, ~8 nových/upravených súborov, 3 cron jobs.
