-- Evidencia hromadných mailov rozposlaných z admina.
-- Zapisuje výhradne edge funkcia send-broadcast (service role), preto tu
-- je len čítacia politika pre adminov — nikto iný sa k obsahu nedostane.

create table if not exists public.email_broadcasts (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  created_by       uuid not null references auth.users(id) on delete cascade,
  -- news = novinka (rešpektuje odhlásenie z mailov), ops = prevádzkový oznam
  kind             text not null check (kind in ('news', 'ops')),
  audience         text not null,
  subject          text not null,
  body             text not null,
  recipients_total integer not null default 0,
  sent_count       integer not null default 0,
  failed_count     integer not null default 0,
  -- Adresy, ktoré Resend odmietol. Podľa nich sa dá poslať znova len im.
  failed_emails    text[] not null default '{}',
  status           text not null default 'sending'
                     check (status in ('sending', 'done', 'failed')),
  error            text
);

create index if not exists email_broadcasts_created_at_idx
  on public.email_broadcasts (created_at desc);

alter table public.email_broadcasts enable row level security;

drop policy if exists "admins_read_email_broadcasts" on public.email_broadcasts;
create policy "admins_read_email_broadcasts"
  on public.email_broadcasts
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));
