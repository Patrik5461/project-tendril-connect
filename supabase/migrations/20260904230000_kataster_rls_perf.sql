-- Výkonnostná oprava RLS pre tabuľky modulu Kataster.
--
-- Politiky volali public.has_role(auth.uid(), 'admin') priamo, takže Postgres
-- ju vyhodnocoval pre KAŽDÝ riadok. Nad spf_folios (1,09 mil. riadkov) to
-- znamenalo 13,6 s na obyčajný count a dopyt spadol na statement timeoute —
-- v appke to vyzeralo ako chyba bez textu.
--
-- Zabalenie do poddotazu `(select ...)` spraví z volania InitPlan, ktorý sa
-- vyhodnotí raz. Je to odporúčaný postup Supabase na RLS nad veľkými tabuľkami.

do $$
declare
  t text;
begin
  foreach t in array array['ku_list', 'cadastral_parcels', 'cadastral_sync_runs', 'spf_folios']
  loop
    execute format('drop policy if exists %I on public.%I', 'admins_read_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'admins_insert_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'admins_update_' || t, t);

    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.has_role(auth.uid(), ''admin'')))',
      'admins_read_' || t, t);

    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check ((select public.has_role(auth.uid(), ''admin'')))',
      'admins_insert_' || t, t);

    execute format(
      'create policy %I on public.%I for update to authenticated
         using ((select public.has_role(auth.uid(), ''admin'')))
         with check ((select public.has_role(auth.uid(), ''admin'')))',
      'admins_update_' || t, t);
  end loop;
end $$;
