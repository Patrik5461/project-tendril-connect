-- Listy vlastníctva, kde je SPF správcom pozemkov nezistených vlastníkov.
--
-- Zdroj: "Zoznam nezistených vlastníkov" zverejňovaný SPF dvakrát ročne
-- (7 CSV súborov). Napĺňa scripts/import-spf-folios.ts.
--
-- Zámerne NEUKLADÁME mená vlastníkov: na hľadanie pozemkov SPF stačí počet
-- a kopírovať si do vlastnej databázy 5 miliónov mien fyzických osôb nie je
-- ani potrebné, ani žiaduce. Mená ostávajú v zdroji na pozfond.sk.
--
-- Toto je medzikrok — je to úroveň LV, nie parcely. Parcelnú úroveň doplnia
-- až hromadné dáta z ÚGKK do cadastral_parcels.

create table if not exists public.spf_folios (
  id           uuid primary key default gen_random_uuid(),
  ku_code      text not null references public.ku_list(ku_code) on delete cascade,
  lv_number    text not null,
  owners_count integer not null default 0,
  source       text not null default 'nezisteni_vlastnici',
  -- k akému dátumu je zoznam platný (z názvu súboru)
  valid_as_of  date,
  updated_at   timestamptz not null default now(),
  unique (ku_code, lv_number, source)
);

-- Samostatný index na ku_code netreba: je to prefix unikátneho kľúča
-- (ku_code, lv_number, source), ktorý Postgres na filter podľa k.ú. použije sám.
create index if not exists spf_folios_lv_idx on public.spf_folios (lv_number);

alter table public.spf_folios enable row level security;

drop policy if exists "admins_read_spf_folios"   on public.spf_folios;
drop policy if exists "admins_insert_spf_folios" on public.spf_folios;
drop policy if exists "admins_update_spf_folios" on public.spf_folios;

create policy "admins_read_spf_folios" on public.spf_folios
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admins_insert_spf_folios" on public.spf_folios
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "admins_update_spf_folios" on public.spf_folios
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
