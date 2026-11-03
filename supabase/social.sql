-- Verim Asistanı v1.4 — Arkadaşlar, ortak alışkanlıklar ve liderlik tablosu
-- Supabase panelinde: SQL Editor > New query > bu dosyanın tamamını yapıştır > Run.
-- (Önce schema.sql çalıştırılmış olmalı. Bu dosyayı birden çok kez çalıştırmak güvenlidir.)
--
-- GİZLİLİK İLKESİ
--  * Kimse başkasının kayıtlarını (vault_records) okuyamaz; o tablodaki kurallar değişmedi.
--  * Arkadaşlar yalnızca şunları görür:
--      - görünen ad
--      - lig XP'si ve lig serisi — SADECE kişi "tabloda görün"ü açtıysa
--      - ortak alışkanlıkta, katıldığı günden beri hangi gün/saatte yaptığı (ayrılınca silinir)
--  * Lig XP'si sunucuda, aşağıdaki fonksiyonlarla hesaplanır ve yalnızca toplam sayı döner.

-- ---------------------------------------------------------------------------
-- Profil
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name   text not null default '' check (char_length(display_name) <= 40),
  invite_code    text not null unique,
  show_in_league boolean not null default false, -- tabloda görünmek: varsayılan KAPALI
  league_asked   boolean not null default false, -- "tabloda görünmek ister misin" bir kez soruldu mu
  tz             text not null default 'Europe/Istanbul',
  day_start_hour int  not null default 0 check (day_start_hour between 0 and 6),
  created_at     timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profile own select" on public.profiles;
drop policy if exists "profile own update" on public.profiles;
create policy "profile own select" on public.profiles for select using (auth.uid() = user_id);
create policy "profile own update" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Davet kodu yalnızca fonksiyonla değişir (kullanıcı tahmin edilebilir bir kod seçemesin).
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, show_in_league, league_asked, tz, day_start_hour) on public.profiles to authenticated;

create or replace function public.new_invite_code() returns text language sql volatile as $$
  -- karışan harfler (0/O, 1/I) yok
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 8);
$$;

create or replace function public.safe_tz(z text) returns text language sql stable as $$
  select coalesce((select name from pg_timezone_names where name = z limit 1), 'UTC');
$$;

/** Profili oluşturur ya da saat dilimi / gün başlangıcı / adı günceller. */
create or replace function public.ensure_profile(p_name text, p_tz text, p_day_start int)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.profiles;
begin
  if me is null then raise exception 'not signed in'; end if;
  insert into profiles (user_id, display_name, invite_code, tz, day_start_hour)
  values (me, left(coalesce(trim(p_name), ''), 40), new_invite_code(), safe_tz(p_tz), least(6, greatest(0, coalesce(p_day_start, 0))))
  on conflict (user_id) do update
    set tz = safe_tz(p_tz),
        day_start_hour = least(6, greatest(0, coalesce(p_day_start, 0))),
        display_name = case when coalesce(trim(p_name), '') <> '' then left(trim(p_name), 40) else profiles.display_name end
  returning * into r;
  return r;
end $$;

create or replace function public.regenerate_invite_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  update profiles set invite_code = new_invite_code() where user_id = auth.uid() returning invite_code into c;
  return c;
end $$;

-- ---------------------------------------------------------------------------
-- Arkadaşlık (karşılıklı; davet kodunu bilen ekler, kod istenince yenilenir)
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  a uuid not null references auth.users (id) on delete cascade,
  b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
alter table public.friendships enable row level security;
drop policy if exists "friendship own select" on public.friendships;
create policy "friendship own select" on public.friendships for select using (auth.uid() in (a, b));
revoke insert, update, delete on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;

-- Kod tahminine karşı: saatte en fazla 20 hatalı deneme
create table if not exists public.friend_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists friend_attempts_idx on public.friend_attempts (user_id, at);
alter table public.friend_attempts enable row level security;
revoke all on public.friend_attempts from anon, authenticated;

create or replace function public.are_friends(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where a = least(x, y) and b = greatest(x, y));
$$;

create or replace function public.add_friend(p_code text)
returns table (user_id uuid, display_name text)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other public.profiles; c text;
begin
  if me is null then raise exception 'not signed in'; end if;
  if (select count(*) from friend_attempts f where f.user_id = me and f.at > now() - interval '1 hour') >= 20 then
    raise exception 'too many attempts';
  end if;
  c := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if c like 'VERIM%' then c := substr(c, 6); end if;
  select * into other from profiles p where p.invite_code = c;
  if other.user_id is null then
    insert into friend_attempts (user_id) values (me);
    raise exception 'invalid code';
  end if;
  if other.user_id = me then raise exception 'own code'; end if;
  insert into friendships (a, b) values (least(me, other.user_id), greatest(me, other.user_id)) on conflict do nothing;
  return query select other.user_id, other.display_name;
end $$;

create or replace function public.my_friends()
returns table (user_id uuid, display_name text, since timestamptz)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.display_name, f.created_at
  from friendships f
  join profiles p on p.user_id = case when f.a = auth.uid() then f.b else f.a end
  where auth.uid() in (f.a, f.b)
  order by p.display_name;
$$;

-- ---------------------------------------------------------------------------
-- Ortak alışkanlıklar
-- Herkes kendi alışkanlığını tutar; grup yalnızca bir "bağ"dır. Paylaşılan tek şey o alışkanlığın
-- katılınan günden beri hangi gün / saatte yapıldığıdır. Ayrılınca bu kayıtlar silinir.
-- ---------------------------------------------------------------------------
create table if not exists public.shared_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default '🎯',
  color text not null default '#3d82f0',
  slots jsonb not null default '[]'::jsonb, -- [{id, name}] — bölümlü alışkanlık şablonu
  weekly_target int not null default 7 check (weekly_target between 1 and 7),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id uuid not null references public.shared_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table if not exists public.group_invites (
  group_id uuid not null references public.shared_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table if not exists public.shared_checks (
  group_id uuid not null references public.shared_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  slot text not null default '',
  at timestamptz,
  primary key (group_id, user_id, day, slot)
);
create table if not exists public.reactions (
  group_id uuid not null references public.shared_groups (id) on delete cascade,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  day date not null,
  emoji text not null check (emoji in ('👏', '🔥', '💪', '👉')),
  created_at timestamptz not null default now(),
  primary key (group_id, from_user, to_user, day)
);

create or replace function public.is_member(g uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members m where m.group_id = g and m.user_id = u);
$$;

alter table public.shared_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.shared_checks enable row level security;
alter table public.reactions enable row level security;
drop policy if exists "group visible" on public.shared_groups;
drop policy if exists "members visible" on public.group_members;
drop policy if exists "invites visible" on public.group_invites;
drop policy if exists "checks visible" on public.shared_checks;
drop policy if exists "reactions visible" on public.reactions;
create policy "group visible" on public.shared_groups for select
  using (is_member(id) or exists (select 1 from group_invites i where i.group_id = id and i.user_id = auth.uid()));
create policy "members visible" on public.group_members for select using (is_member(group_id));
create policy "invites visible" on public.group_invites for select using (user_id = auth.uid() or is_member(group_id));
create policy "checks visible" on public.shared_checks for select using (is_member(group_id));
create policy "reactions visible" on public.reactions for select using (auth.uid() in (from_user, to_user) and is_member(group_id));
-- Yazma yalnızca aşağıdaki fonksiyonlarla
revoke insert, update, delete on public.shared_groups, public.group_members, public.group_invites, public.shared_checks, public.reactions from anon, authenticated;
grant select on public.shared_groups, public.group_members, public.group_invites, public.shared_checks, public.reactions to authenticated;

create or replace function public.create_group(p_name text, p_icon text, p_color text, p_slots jsonb, p_weekly_target int, p_invite uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g uuid; u uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  insert into shared_groups (name, icon, color, slots, weekly_target, created_by)
  values (left(trim(p_name), 60), left(coalesce(p_icon, '🎯'), 8), left(coalesce(p_color, '#3d82f0'), 9),
          case when jsonb_typeof(p_slots) = 'array' then p_slots else '[]'::jsonb end,
          least(7, greatest(1, coalesce(p_weekly_target, 7))), me)
  returning id into g;
  insert into group_members (group_id, user_id) values (g, me);
  foreach u in array coalesce(p_invite, '{}'::uuid[]) loop
    if are_friends(me, u) then
      insert into group_invites (group_id, user_id, invited_by) values (g, u, me) on conflict do nothing;
    end if;
  end loop;
  return g;
end $$;

create or replace function public.invite_to_group(g uuid, u uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(g) then raise exception 'not a member'; end if;
  if not are_friends(auth.uid(), u) then raise exception 'not friends'; end if;
  if is_member(g, u) then return; end if;
  insert into group_invites (group_id, user_id, invited_by) values (g, u, auth.uid()) on conflict do nothing;
end $$;

create or replace function public.my_invites()
returns table (group_id uuid, name text, icon text, color text, slots jsonb, weekly_target int, invited_by_name text, members int)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.icon, g.color, g.slots, g.weekly_target, p.display_name,
         (select count(*)::int from group_members m where m.group_id = g.id)
  from group_invites i
  join shared_groups g on g.id = i.group_id
  left join profiles p on p.user_id = i.invited_by
  where i.user_id = auth.uid()
  order by i.created_at desc;
$$;

create or replace function public.respond_invite(g uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from group_invites where group_id = g and user_id = auth.uid()) then raise exception 'no invite'; end if;
  delete from group_invites where group_id = g and user_id = auth.uid();
  if accept then insert into group_members (group_id, user_id) values (g, auth.uid()) on conflict do nothing; end if;
end $$;

/** Gruptan ayrıl: paylaşılmış tüm günlerin/saatlerin ve tepkilerin silinir. Grupta kimse kalmazsa grup silinir. */
create or replace function public.leave_group(g uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  delete from shared_checks where group_id = g and user_id = me;
  delete from reactions where group_id = g and (from_user = me or to_user = me);
  delete from group_members where group_id = g and user_id = me;
  delete from group_invites where group_id = g and (user_id = me or invited_by = me);
  if not exists (select 1 from group_members where group_id = g) then delete from shared_groups where id = g; end if;
end $$;

/** Arkadaşlıktan çıkar: ortak gruplarda da ayrılırsın (paylaşımın durur ve silinir). */
create or replace function public.remove_friend(u uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g uuid;
begin
  delete from friendships where a = least(me, u) and b = greatest(me, u);
  for g in select m1.group_id from group_members m1 join group_members m2 on m2.group_id = m1.group_id and m2.user_id = u where m1.user_id = me loop
    perform leave_group(g);
  end loop;
  delete from group_invites where (user_id = me and invited_by = u) or (user_id = u and invited_by = me);
end $$;

create or replace function public.my_groups()
returns table (group_id uuid, name text, icon text, color text, slots jsonb, weekly_target int, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.icon, g.color, g.slots, g.weekly_target, m.joined_at
  from group_members m join shared_groups g on g.id = m.group_id
  where m.user_id = auth.uid()
  order by g.created_at;
$$;

create or replace function public.group_overview(g uuid, since date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not is_member(g) then raise exception 'not a member'; end if;
  return jsonb_build_object(
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', p.display_name, 'joined_at', m.joined_at, 'me', m.user_id = me) order by m.joined_at), '[]')
                from group_members m left join profiles p on p.user_id = m.user_id where m.group_id = g),
    'checks', (select coalesce(jsonb_agg(jsonb_build_object('user_id', c.user_id, 'day', c.day, 'slot', c.slot, 'at', c.at)), '[]')
               from shared_checks c where c.group_id = g and c.day >= since),
    'reactions', (select coalesce(jsonb_agg(jsonb_build_object('from', r.from_user, 'to', r.to_user, 'day', r.day, 'emoji', r.emoji)), '[]')
                  from reactions r where r.group_id = g and r.day >= since and me in (r.from_user, r.to_user)),
    'invited', (select coalesce(jsonb_agg(jsonb_build_object('user_id', i.user_id, 'name', p.display_name)), '[]')
                from group_invites i left join profiles p on p.user_id = i.user_id where i.group_id = g)
  );
end $$;

/**
 * Kendi tiklerini yayınla (uygulama eşitlemede çağırır): [from, to] aralığındaki kayıtların yerine
 * gönderilenleri koyar. Katılma gününden önceki günler asla paylaşılmaz.
 */
create or replace function public.publish_checks(g uuid, p_from date, p_to date, p_rows jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); joined date; lo date; hi date;
begin
  select (m.joined_at at time zone safe_tz(coalesce(p.tz, 'UTC')))::date into joined
  from group_members m left join profiles p on p.user_id = m.user_id
  where m.group_id = g and m.user_id = me;
  if joined is null then raise exception 'not a member'; end if;
  lo := greatest(p_from, joined);
  hi := least(p_to, current_date + 1);
  if hi < lo then return; end if;
  delete from shared_checks where group_id = g and user_id = me and day between lo and hi;
  insert into shared_checks (group_id, user_id, day, slot, at)
  select g, me, (r->>'day')::date, left(coalesce(r->>'slot', ''), 64),
         case when jsonb_typeof(r->'at') = 'number' then to_timestamp((r->>'at')::double precision / 1000) end
  from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) r
  where (r->>'day') ~ '^\d{4}-\d{2}-\d{2}$' and (r->>'day')::date between lo and hi
  on conflict do nothing;
end $$;

drop function if exists public.react(uuid, uuid, date, text);
create or replace function public.react(g uuid, p_to uuid, p_day date, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(g) or not is_member(g, p_to) or p_to = auth.uid() then raise exception 'not allowed'; end if;
  insert into reactions as r (group_id, from_user, to_user, day, emoji) values (g, auth.uid(), p_to, p_day, p_emoji)
  on conflict on constraint reactions_pkey do update set emoji = excluded.emoji, created_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- Lig XP'si (kasılmaya karşı sınırlı) — kayıtlardan sunucuda hesaplanır, dışarıya yalnızca toplam çıkar.
--  Alışkanlık: 10 (bölüm başına 5) — yalnızca O GÜN atılan tik (geçmişe dönük işaretleme 0)
--  Odak: 5 dk başına 2 — yalnızca zamanlayıcı/kronometre (elle eklenen 0); oturum en fazla 300 dk, günde en fazla 480 dk
--  Görev: 10 (öncelikten bağımsız) — oluşturduktan en az 1 saat sonra bitirilmiş olmalı; günde en fazla 5 görev
--  Hedefli görev tiki: 5 — görev başına günde 1, günde en fazla 5
-- ---------------------------------------------------------------------------
create or replace function public.league_day_points(uid uuid, p_from date, p_to date)
returns table (day date, points int)
language sql stable security definer set search_path = public as $$
  with prof as (
    select safe_tz(coalesce((select tz from profiles where user_id = uid), 'UTC')) as tz,
           coalesce((select day_start_hour from profiles where user_id = uid), 0) as dsh
  ),
  recs as (
    select v.tbl, v.data from vault_records v
    where v.user_id = uid and v.deleted = false and v.tbl in ('habitLogs', 'focus', 'tasks', 'taskChecks')
  ),
  habit as (
    select (r.data->>'date')::date as day,
           case when coalesce(r.data->>'slotId', '') <> '' then 5 else 10 end as pts
    from recs r, prof
    where r.tbl = 'habitLogs'
      and (r.data->>'done') = '1'
      and jsonb_typeof(r.data->'at') = 'number'
      and (r.data->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
      and (r.data->>'date')::date between p_from and p_to
      and ((to_timestamp((r.data->>'at')::double precision / 1000) at time zone prof.tz) - make_interval(hours => prof.dsh))::date = (r.data->>'date')::date
  ),
  focus as (
    select (r.data->>'date')::date as day, least(greatest((r.data->>'minutes')::int, 0), 300) as m
    from recs r
    where r.tbl = 'focus' and (r.data->>'src') in ('timer', 'stopwatch')
      and (r.data->>'date') ~ '^\d{4}-\d{2}-\d{2}$' and (r.data->>'date')::date between p_from and p_to
  ),
  focus_day as (select f.day, (least(sum(f.m), 480)::int / 5) * 2 as pts from focus f group by f.day),
  tasks as (
    select ((to_timestamp((r.data->>'doneAt')::double precision / 1000) at time zone prof.tz) - make_interval(hours => prof.dsh))::date as day,
           (r.data->>'doneAt')::bigint as done_at
    from recs r, prof
    where r.tbl = 'tasks' and r.data->>'status' = 'done'
      and jsonb_typeof(r.data->'doneAt') = 'number' and jsonb_typeof(r.data->'createdAt') = 'number'
      and (r.data->>'doneAt')::bigint - (r.data->>'createdAt')::bigint >= 3600000
  ),
  task_day as (
    select t.day, least(count(*), 5)::int * 10 as pts from tasks t where t.day between p_from and p_to group by t.day
  ),
  checks as (
    select (r.data->>'date')::date as day, r.data->>'taskId' as task
    from recs r, prof
    where r.tbl = 'taskChecks' and jsonb_typeof(r.data->'at') = 'number'
      and (r.data->>'date') ~ '^\d{4}-\d{2}-\d{2}$' and (r.data->>'date')::date between p_from and p_to
      and ((to_timestamp((r.data->>'at')::double precision / 1000) at time zone prof.tz) - make_interval(hours => prof.dsh))::date = (r.data->>'date')::date
  ),
  check_day as (
    select c.day, least(count(distinct c.task), 5)::int * 5 as pts from checks c group by c.day
  ),
  allp as (
    select h.day, h.pts from habit h
    union all select f.day, f.pts from focus_day f
    union all select t.day, t.pts from task_day t
    union all select c.day, c.pts from check_day c
  )
  select a.day, sum(a.pts)::int from allp a group by a.day;
$$;
revoke execute on function public.league_day_points(uuid, date, date) from public, anon, authenticated;

/** Duolingo tarzı lig serisi: lig XP'si >= 10 olan ardışık günler, uygulamadaki dondurma kurallarıyla. */
create or replace function public.league_streak(uid uuid, OUT current int, OUT longest int)
language plpgsql stable security definer set search_path = public as $$
declare
  tz text; dsh int; today date; d date; first date; act boolean;
  streak int := 0; best int := 0; freezes int := 0; since_freeze int := 0;
  pts jsonb;
begin
  select safe_tz(coalesce(p.tz, 'UTC')), coalesce(p.day_start_hour, 0) into tz, dsh from profiles p where p.user_id = uid;
  tz := coalesce(tz, 'UTC'); dsh := coalesce(dsh, 0);
  today := ((now() at time zone tz) - make_interval(hours => dsh))::date;
  select coalesce(jsonb_object_agg(x.day::text, x.points), '{}'::jsonb) into pts
  from league_day_points(uid, today - 730, today) x where x.points >= 10;
  select min(k::date) into first from jsonb_object_keys(pts) k;
  current := 0; longest := 0;
  if first is null then return; end if;
  d := first;
  while d <= today loop
    act := pts ? d::text;
    if act then
      streak := streak + 1; since_freeze := since_freeze + 1;
      if since_freeze >= 7 then since_freeze := 0; if freezes < 2 then freezes := freezes + 1; end if; end if;
    elsif d = today then
      null; -- bugün henüz bitmedi: seri bozulmaz
    elsif streak > 0 and freezes > 0 then
      freezes := freezes - 1;
    else
      streak := 0; since_freeze := 0;
    end if;
    best := greatest(best, streak);
    d := d + 1;
  end loop;
  current := streak; longest := best;
end $$;
revoke execute on function public.league_streak(uuid) from public, anon, authenticated;

/**
 * Liderlik tablosu. period: 'week' | 'month' | 'streak'.
 * Ben + "tabloda görün"ü açmış arkadaşlarım. Kendim gizliysem kendimi yine görürüm (hidden=true), arkadaşlarım görmez.
 */
create or replace function public.leaderboard(period text)
returns table (user_id uuid, display_name text, points int, longest int, is_me boolean, hidden boolean)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); tz text; dsh int; today date; lo date; hi date;
begin
  if me is null then raise exception 'not signed in'; end if;
  select safe_tz(coalesce(p.tz, 'UTC')), coalesce(p.day_start_hour, 0) into tz, dsh from profiles p where p.user_id = me;
  tz := coalesce(tz, 'UTC'); dsh := coalesce(dsh, 0);
  today := ((now() at time zone tz) - make_interval(hours => dsh))::date;
  if period = 'month' then lo := date_trunc('month', today)::date; hi := (date_trunc('month', today) + interval '1 month - 1 day')::date;
  else lo := date_trunc('week', today)::date; hi := lo + 6; end if;
  return query
  with people as (
    select p.user_id, p.display_name, p.show_in_league, p.user_id = me as is_me
    from profiles p
    where p.user_id = me
       or (p.show_in_league and exists (select 1 from friendships f where f.a = least(me, p.user_id) and f.b = greatest(me, p.user_id)))
  )
  select pe.user_id, pe.display_name,
         case when period = 'streak' then (select s.current from league_streak(pe.user_id) s)
              else coalesce((select sum(x.points)::int from league_day_points(pe.user_id, lo, hi) x), 0) end,
         case when period = 'streak' then (select s.longest from league_streak(pe.user_id) s) else null end,
         pe.is_me, not pe.show_in_league
  from people pe
  order by 3 desc, 2;
end $$;

grant execute on function
  public.ensure_profile(text, text, int), public.regenerate_invite_code(), public.add_friend(text), public.my_friends(),
  public.remove_friend(uuid), public.create_group(text, text, text, jsonb, int, uuid[]), public.invite_to_group(uuid, uuid),
  public.my_invites(), public.respond_invite(uuid, boolean), public.leave_group(uuid), public.my_groups(),
  public.group_overview(uuid, date), public.publish_checks(uuid, date, date, jsonb), public.react(uuid, uuid, date, text),
  public.leaderboard(text)
to authenticated;
-- Yardımcılar yalnızca yukarıdaki fonksiyonların içinden kullanılır (is_member satır kurallarında gerektiği için açık kalır).
revoke execute on function public.new_invite_code(), public.are_friends(uuid, uuid), public.safe_tz(text) from public, anon, authenticated;
revoke execute on function public.is_member(uuid, uuid) from public, anon;
grant execute on function public.is_member(uuid, uuid) to authenticated;
