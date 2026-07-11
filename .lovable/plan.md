## Cieľ

Zaviesť admin rolu, založiť účet `admin@tendrik.sk`, presunúť všetky admin akcie do samostatnej sekcie `/admin` a skryť admin prvky z bežného UI.

## 1. Databáza (migrácia)

Použijeme kanonický vzor `user_roles` + `has_role()` (nie stĺpec `role` v profiloch — bezpečnostný dôvod: privilege escalation cez UPDATE. Toto je jediná odchýlka od zadania, vysvetlím používateľovi.)

- `create type app_role as enum ('user','admin')`
- `create table public.user_roles (id, user_id, role, unique(user_id,role))` + GRANTy + RLS
- `create function public.has_role(_user_id uuid, _role app_role) returns boolean security definer` — používa sa v RLS aj v edge funkciách
- RLS policy: každý user vidí len svoje role; admin vidí všetky
- Pridať pomocnú view/RPC `admin_overview_stats()` (security definer) — vracia počty trial/active/expired, počty tendrov podľa zdroja/krajiny, posledný fetch (z `tenders.created_at` max per source)
- RPC `admin_list_users()` (security definer, guard `has_role(auth.uid(),'admin')`) — spojí `auth.users` + `user_preferences` + počet `user_radars`
- Nový stĺpec `app_settings.key='gopay_env_override'` nepotrebujeme — GOPAY_ENV je secret; prepínač urobíme cez existujúcu tabuľku `app_settings` (kľúč `gopay_mode`) čítanú v edge funkciách ako override sekundárny voči envu

## 2. Založenie admin účtu

Nebudeme vkladať heslo v kóde. Postup, ktorý používateľovi napíšem po dokončení:

**Odporúčaný postup A – cez Supabase dashboard (funguje aj bez doručenia mailu):**
1. Supabase → Authentication → Users → Add user → `admin@tendrik.sk`, "Auto Confirm User"
2. Ten istý user → "Send password recovery" (ak schránka funguje) alebo "Send magic link"
3. Alternatíva: v Add user rovno zadať dočasné heslo, ktoré si po prvom prihlásení hneď zmeníte cez Settings → Password

Po vytvorení užívateľa spustí sa naša SQL migrácia, ktorá do `user_roles` vloží `(user_id, 'admin')` pre e-mail `admin@tendrik.sk` (`INSERT ... SELECT id FROM auth.users WHERE email='admin@tendrik.sk' ON CONFLICT DO NOTHING`). Ak účet ešte neexistuje, migrácia neurobí nič a spustíme rovnaký insert znova po vytvorení účtu (pripravím jednorazový SQL snippet, ktorý používateľ pustí v SQL editore).

## 3. `/admin` route (chránená)

- `src/routes/_authenticated/admin.tsx` — pri `beforeLoad` overí cez server function `checkIsAdmin` (RPC `has_role`), inak `redirect → /dashboard`
- Server functions (`src/lib/admin.functions.ts`) — všetky s `requireSupabaseAuth` + kontrolou `has_role(userId,'admin')` a až potom robia prácu:
  - `getAdminOverview` — počty používateľov, tendrov, posledný fetch per source
  - `listAdminUsers` — cez `supabaseAdmin` (dynamický import), len bezpečné polia: email, subscription_status, trial_started_at, created_at, radars_count
  - `triggerFetchTenders` / `triggerFetchUvo` / `triggerBackfillTed` / `triggerBackfillUvo` / `triggerCleanup` / `triggerDailyDigest` / `triggerWeeklyDigest` / `triggerDeadlineReminders` / `triggerGenerateSummaries` — každá invokuje príslušnú edge funkciu cez service role
  - `getCronJobs` — SELECT z `cron.job` a `cron.job_run_details` (top 20) cez supabaseAdmin
  - `getAiSummariesEnabled` / `setAiSummariesEnabled` — RPC ktoré už existuje
  - `getGopayMode` / `setGopayMode` — app_settings kľúč `gopay_mode` (`sandbox`|`production`), read v edge funkciách má prioritu nad env, ak je nastavený
  - `simulateGopayWebhook` — priame volanie `gopay-webhook` s `simulate:true`

UI: tab layout (Overview / Actions / Cron / Users / GoPay), jednoduchý bez extra knižníc, `Table` z shadcn.

## 4. Skrytie admin prvkov z bežného UI

Prehľadám `dashboard.tsx` a `settings.tsx` a odstránim / presuniem do `/admin`:
- prípadné manuálne fetch/backfill/cleanup tlačidlá
- prepínač AI zhrnutí
- webhook simulator
Do hlavičky pre admina pridám nenápadný link „Admin" (viditeľný iba keď `has_role`).

## 5. Edge funkcie — GoPay mode override

V `_shared/gopay.ts` doplním: pred `Deno.env.get("GOPAY_ENV")` pozrieť `app_settings.key='gopay_mode'` (ak je 'production'/'sandbox' použiť to). Cache per invocation.

## 6. Runtime error z prehľadu

Vidím `GOPAY_NOT_CONFIGURED` 503 — to je očakávané správanie (placeholder kľúče), ošetrené v UI. Nechávam.

## Doručím po implementácii

- Presný postup nastavenia hesla pre `admin@tendrik.sk` (dashboard krokmi).
- Overenie: prihlásený admin uvidí `/admin` a link v hlavičke; bežný účet dostane redirect na `/dashboard`.

## Súbory (odhad)

Nové: migrácia, `src/routes/_authenticated/admin.tsx`, `src/lib/admin.functions.ts`, tabs komponenty (inline v admin.tsx).
Upravené: `_shared/gopay.ts`, `src/routes/_authenticated/route.tsx` (admin link), `src/routes/_authenticated/dashboard.tsx` a `settings.tsx` (odstrániť admin akcie), `src/integrations/supabase/types.ts` (regeneruje sa po migrácii).
