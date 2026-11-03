\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''
insert into auth.users values (:A), (:B), (:C);
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', u::text, false) $$;
create or replace function pg_temp.ms(t timestamptz) returns bigint language sql as $$ select (extract(epoch from t) * 1000)::bigint $$;
create or replace function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$ begin if not cond then raise exception 'FAIL: %', msg; end if; raise notice 'ok: %', msg; end $$;
create or replace function pg_temp.fails(q text, msg text) returns void language plpgsql as $$ begin begin execute q; exception when others then raise notice 'ok (reddedildi): % — %', msg, sqlerrm; return; end; raise exception 'FAIL (izin verildi): %', msg; end $$;
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;
select pg_temp.as_user(:A);
select display_name from ensure_profile('Ayşe', 'Europe/Istanbul', 0);
select pg_temp.as_user(:B);
select display_name from ensure_profile('Berk', 'Europe/Istanbul', 0);
select pg_temp.as_user(:C);
select display_name from ensure_profile('Cem', 'Europe/Istanbul', 0);

-- Ayşe'nin kayıtları (bugün İstanbul saatiyle)
select pg_temp.as_user(:A);
do $$
declare today text := to_char((now() at time zone 'Europe/Istanbul')::date, 'YYYY-MM-DD');
        yday text := to_char((now() at time zone 'Europe/Istanbul')::date - 1, 'YYYY-MM-DD');
        n bigint := pg_temp.ms(now());
begin
  perform push_records(jsonb_build_array(
    jsonb_build_object('tbl','habitLogs','id','h1','updated_at',n,'data',jsonb_build_object('habitId','h','date',today,'done',1,'at',n)),               -- 10
    jsonb_build_object('tbl','habitLogs','id','h2','updated_at',n,'data',jsonb_build_object('habitId','h','date',yday,'done',1,'at',n)),                -- geçmişe dönük: 0
    jsonb_build_object('tbl','habitLogs','id','h3','updated_at',n,'data',jsonb_build_object('habitId','p','date',today,'slotId','s1','done',1,'at',n)), -- 5
    jsonb_build_object('tbl','habitLogs','id','h4','updated_at',n,'data',jsonb_build_object('habitId','q','date',today,'done',0,'at',null)),            -- 0
    jsonb_build_object('tbl','focus','id','f1','updated_at',n,'data',jsonb_build_object('date',today,'minutes',50,'src','timer')),                     -- 20
    jsonb_build_object('tbl','focus','id','f2','updated_at',n,'data',jsonb_build_object('date',today,'minutes',100,'src','manual')),                   -- 0
    jsonb_build_object('tbl','focus','id','f3','updated_at',n,'data',jsonb_build_object('date',today,'minutes',600,'src','stopwatch')),                -- 300 → toplam 350 → 140
    jsonb_build_object('tbl','tasks','id','t0','updated_at',n,'data',jsonb_build_object('status','done','createdAt',n-600000,'doneAt',n)),             -- 10 dk: 0
    jsonb_build_object('tbl','taskChecks','id','c1','updated_at',n,'data',jsonb_build_object('taskId','x','date',today,'at',n)),
    jsonb_build_object('tbl','taskChecks','id','c2','updated_at',n,'data',jsonb_build_object('taskId','x','date',today,'at',n)),                       -- aynı görev: 1 sayılır → 5
    jsonb_build_object('tbl','taskChecks','id','c3','updated_at',n,'data',jsonb_build_object('taskId','y','date',today,'at',n))                        -- 5
  ));
  for i in 1..7 loop  -- 7 görev, 5 sayılır → 50
    perform push_records(jsonb_build_array(jsonb_build_object('tbl','tasks','id','t'||i,'updated_at',n,'data',jsonb_build_object('status','done','createdAt',n-7200000,'doneAt',n-i*1000))));
  end loop;
end $$;
-- beklenen bugün: 10 + 5 + 140 + 50 + 10 = 215

-- Berk Ayşe'nin kodunu girer
select pg_temp.as_user(:B);
select pg_temp.fails('select add_friend(''ZZZZZZZZ'')', 'yanlış kod');
reset role; select invite_code as acode from profiles where user_id = :A \gset
set role authenticated; select pg_temp.as_user(:B);
select * from add_friend('verim-' || lower(:'acode'));
select pg_temp.ok((select count(*) from my_friends()) = 1, 'Berk''in 1 arkadaşı var');
select pg_temp.ok((select count(*) from profiles) = 1, 'Berk başkasının profil satırını göremez');
select pg_temp.ok((select count(*) from vault_records) = 0, 'Berk Ayşe''nin kayıtlarını göremez');
select pg_temp.fails('update profiles set invite_code = ''AAAA'' ', 'davet kodunu elle değiştirme');
select pg_temp.fails('insert into friendships values (''aaaaaaaa-0000-0000-0000-000000000001'',''cccccccc-0000-0000-0000-000000000003'')', 'başkaları adına arkadaşlık');

-- Tablo: Ayşe gizli (varsayılan kapalı)
select pg_temp.ok((select count(*) from leaderboard('week')) = 1, 'Ayşe gizliyken Berk sadece kendini görür');
select pg_temp.as_user(:A);
select pg_temp.ok((select points from leaderboard('week') where is_me) = 215, 'Ayşe''nin lig XP''si 215 (kurallar uygulandı)');
select pg_temp.ok((select hidden from leaderboard('week') where is_me), 'Ayşe kendini gizli olarak görür');
update profiles set show_in_league = true, league_asked = true;
select pg_temp.as_user(:B);
select pg_temp.ok((select points from leaderboard('week') where display_name = 'Ayşe') = 215, 'Ayşe açınca Berk onu görür');
select pg_temp.ok((select points from leaderboard('month') where display_name = 'Ayşe') = 215, 'aylık tablo');
select pg_temp.ok((select points from leaderboard('streak') where display_name = 'Ayşe') = 1, 'seri tablosu: 1 gün');
select pg_temp.as_user(:C);
select pg_temp.ok((select count(*) from leaderboard('week')) = 1, 'arkadaş olmayan Cem Ayşe''yi görmez');

-- Ortak alışkanlık
select pg_temp.as_user(:A);
select create_group('Kitap oku', '📖', '#3d82f0', '[]', 7, array[:B::uuid, :C::uuid]) as gid \gset
select pg_temp.as_user(:C);
select pg_temp.ok((select count(*) from my_invites()) = 0, 'arkadaş olmayan Cem davet alamaz');
select pg_temp.fails('select group_overview(''' || :'gid' || ''', current_date - 30)', 'üye olmayan grubu göremez');
select pg_temp.ok((select count(*) from shared_checks) = 0, 'Cem paylaşılan tikleri doğrudan da okuyamaz');
select pg_temp.as_user(:B);
select pg_temp.ok((select count(*) from my_invites()) = 1, 'Berk davet aldı');
select respond_invite(:'gid', true);
select pg_temp.as_user(:A);
select publish_checks(:'gid', current_date - 60, current_date,
  jsonb_build_array(jsonb_build_object('day', current_date::text, 'at', pg_temp.ms(now())), jsonb_build_object('day', (current_date - 10)::text, 'at', pg_temp.ms(now()))));
select pg_temp.ok((select count(*) from shared_checks) = 1, 'katılmadan önceki gün paylaşılmaz (sadece bugün)');
select pg_temp.fails('insert into shared_checks (group_id,user_id,day) values (''' || :'gid' || ''', ''aaaaaaaa-0000-0000-0000-000000000001'', current_date)', 'tabloya doğrudan yazma');
select pg_temp.as_user(:B);
select pg_temp.fails('select publish_checks(''' || :'gid' || ''', current_date, current_date, ''[]'') from (select 1) x where false union all select publish_checks(gen_random_uuid(), current_date, current_date, ''[]'')', 'üye olmadığı gruba yayın');
select publish_checks(:'gid', current_date - 5, current_date, jsonb_build_array(jsonb_build_object('day', current_date::text, 'at', pg_temp.ms(now()))));
select pg_temp.ok(jsonb_array_length(group_overview(:'gid', current_date - 30)->'checks') = 2, 'Berk iki üyenin tikini görür');
select react(:'gid', :A, current_date, '👏');
select pg_temp.fails('select react(''' || :'gid' || ''', ''bbbbbbbb-0000-0000-0000-000000000002'', current_date, ''👏'')', 'kendine tepki');
select pg_temp.as_user(:A);
select pg_temp.ok(jsonb_array_length(group_overview(:'gid', current_date - 30)->'reactions') = 1, 'Ayşe tepkiyi görür');
-- Berk ayrılır: tikleri ve tepkileri silinir
select pg_temp.as_user(:B);
select leave_group(:'gid');
select pg_temp.as_user(:A);
select pg_temp.ok(jsonb_array_length(group_overview(:'gid', current_date - 30)->'checks') = 1, 'ayrılınca Berk''in tikleri silindi');
select pg_temp.ok(jsonb_array_length(group_overview(:'gid', current_date - 30)->'reactions') = 0, 'ayrılınca tepkiler silindi');
select pg_temp.ok(jsonb_array_length(group_overview(:'gid', current_date - 30)->'members') = 1, 'grupta Ayşe kaldı');
-- arkadaşlıktan çıkarma
select pg_temp.as_user(:B);
select remove_friend(:A);
select pg_temp.ok((select count(*) from leaderboard('week')) = 1, 'arkadaşlık bitince tablo görünmez');
-- Seri: 8 aktif gün (1 dondurma kazanır), 1 kaçırılan gün (dondurma harcanır), dün aktif, bugün henüz yok → 9
select pg_temp.as_user(:C);
do $$
declare d date; n bigint;
begin
  for i in 1..10 loop
    if i = 2 then continue; end if;  -- 2 gün önce kaçırıldı
    d := (now() at time zone 'Europe/Istanbul')::date - i;
    n := pg_temp.ms((d::timestamp + interval '12 hours') at time zone 'Europe/Istanbul');
    perform push_records(jsonb_build_array(jsonb_build_object('tbl','habitLogs','id','s'||i,'updated_at',n,'data',jsonb_build_object('habitId','h','date',d::text,'done',1,'at',n))));
  end loop;
end $$;
update profiles set show_in_league = true;
select pg_temp.ok((select points from leaderboard('streak') where is_me) = 9, 'dondurmalı seri 9 gün');
select pg_temp.ok((select longest from leaderboard('streak') where is_me) = 9, 'en uzun seri 9');
reset role;
select 'HEPSİ GEÇTİ' as sonuc;
