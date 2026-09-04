-- Interný modul "Kataster" (admin-only).
--
-- Ťahá parcely zo ZBGIS a drží ich lokálne, aby sa dali filtrovať pozemky,
-- kde je vlastníkom alebo správcom Slovenský pozemkový fond (SPF).
-- S existujúcimi modulmi (zákazky, granty, platby, user_preferences) nemá
-- nič spoločné a nič z nich sa tu nemení.

-- 1) Číselník katastrálnych území (ÚGKK).
--    Plní sa jednorazovo z CSV cez scripts/import-ku-list.ts (service role).
create table if not exists public.ku_list (
  ku_code text primary key,
  ku_name text not null,
  okres   text,
  kraj    text
);

create index if not exists ku_list_ku_name_idx on public.ku_list (ku_name);

-- 2) Parcely stiahnuté zo ZBGIS.
create table if not exists public.cadastral_parcels (
  id              uuid primary key default gen_random_uuid(),
  ku_code         text not null references public.ku_list(ku_code) on delete cascade,
  parcel_register text not null check (parcel_register in ('C', 'E')),
  parcel_number   text not null,
  lv_number       text,
  area_m2         numeric,
  land_type       text,
  -- pole { name, role: 'vlastnik'|'spravca'|'iny', share, id_no }
  owners          jsonb not null default '[]'::jsonb,
  -- true, keď je medzi vlastníkmi alebo správcami SPF (počíta ZBGIS klient)
  has_spf         boolean not null default false,
  centroid_lat    numeric,
  centroid_lng    numeric,
  -- surová odpoveď ZBGIS, aby sa dalo dohľadať, odkiaľ hodnota prišla
  raw             jsonb,
  fetched_at      timestamptz not null default now(),
  unique (ku_code, parcel_register, parcel_number)
);

-- Hlavný filter stránky /kataster: konkrétne k.ú. + prepínač "len SPF".
create index if not exists cadastral_parcels_ku_spf_idx
  on public.cadastral_parcels (ku_code, has_spf);

create index if not exists cadastral_parcels_lv_idx
  on public.cadastral_parcels (lv_number);

-- 3) Behy synchronizácie – admin podľa nich sleduje progres.
--    ku_code tu zámerne nemá FK: aj pokus o neznáme k.ú. sa má dať zalogovať.
create table if not exists public.cadastral_sync_runs (
  id            uuid primary key default gen_random_uuid(),
  ku_code       text not null,
  register      text not null default 'both' check (register in ('C', 'E', 'both')),
  mode          text not null check (mode in ('test', 'full')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  -- blocked = ZBGIS vrátil 403/429 a sync sme zastavili
  status        text not null default 'running'
                  check (status in ('running', 'done', 'failed', 'blocked')),
  parcels_total integer not null default 0,
  parcels_done  integer not null default 0,
  spf_count     integer not null default 0,
  errors        jsonb not null default '[]'::jsonb
);

create index if not exists cadastral_sync_runs_started_idx
  on public.cadastral_sync_runs (started_at desc);

-- RLS: čítať aj zapisovať smie výhradne admin rola, service role obchádza RLS.
alter table public.ku_list             enable row level security;
alter table public.cadastral_parcels   enable row level security;
alter table public.cadastral_sync_runs enable row level security;

drop policy if exists "admins_read_ku_list"     on public.ku_list;
drop policy if exists "admins_insert_ku_list"   on public.ku_list;
drop policy if exists "admins_update_ku_list"   on public.ku_list;

create policy "admins_read_ku_list" on public.ku_list
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admins_insert_ku_list" on public.ku_list
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "admins_update_ku_list" on public.ku_list
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins_read_cadastral_parcels"   on public.cadastral_parcels;
drop policy if exists "admins_insert_cadastral_parcels" on public.cadastral_parcels;
drop policy if exists "admins_update_cadastral_parcels" on public.cadastral_parcels;

create policy "admins_read_cadastral_parcels" on public.cadastral_parcels
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admins_insert_cadastral_parcels" on public.cadastral_parcels
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "admins_update_cadastral_parcels" on public.cadastral_parcels
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins_read_cadastral_sync_runs"   on public.cadastral_sync_runs;
drop policy if exists "admins_insert_cadastral_sync_runs" on public.cadastral_sync_runs;
drop policy if exists "admins_update_cadastral_sync_runs" on public.cadastral_sync_runs;

create policy "admins_read_cadastral_sync_runs" on public.cadastral_sync_runs
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admins_insert_cadastral_sync_runs" on public.cadastral_sync_runs
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "admins_update_cadastral_sync_runs" on public.cadastral_sync_runs
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
