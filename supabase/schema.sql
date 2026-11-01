-- Productivity Vault — Supabase şeması
-- Supabase panelinde: SQL Editor > New query > bu dosyanın tamamını yapıştır > Run.
-- Tek bir genel tablo kullanılır: uygulamaya yeni özellik/tablo eklendiğinde SQL değiştirmek gerekmez.

create table if not exists public.vault_records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at bigint      not null,
  deleted    boolean     not null default false,
  server_ts  timestamptz not null default clock_timestamp(),
  primary key (user_id, tbl, id)
);

create index if not exists vault_records_pull_idx on public.vault_records (user_id, server_ts);

alter table public.vault_records enable row level security;

-- Herkes yalnızca kendi kayıtlarını görür/yazar.
drop policy if exists "own rows select" on public.vault_records;
drop policy if exists "own rows insert" on public.vault_records;
drop policy if exists "own rows update" on public.vault_records;
create policy "own rows select" on public.vault_records for select using (auth.uid() = user_id);
create policy "own rows insert" on public.vault_records for insert with check (auth.uid() = user_id);
create policy "own rows update" on public.vault_records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Toplu gönderim: yalnızca daha yeni (updated_at büyük) kayıt eskisinin üzerine yazar.
create or replace function public.push_records(rows jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.vault_records as v (user_id, tbl, id, data, updated_at, deleted, server_ts)
  select auth.uid(),
         r->>'tbl',
         r->>'id',
         r->'data',
         (r->>'updated_at')::bigint,
         coalesce((r->>'deleted')::boolean, false),
         clock_timestamp()
  from jsonb_array_elements(rows) as r
  on conflict (user_id, tbl, id) do update
    set data       = excluded.data,
        updated_at = excluded.updated_at,
        deleted    = excluded.deleted,
        server_ts  = clock_timestamp()
    where v.updated_at < excluded.updated_at;
$$;

grant execute on function public.push_records(jsonb) to authenticated;
