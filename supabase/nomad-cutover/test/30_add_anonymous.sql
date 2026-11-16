-- 익명 사용자 소유 행을 옛 표에 넣는다(postgres = 표 소유자라 freeze와 무관). 02가 건수를 보고하고 중단해야 한다.
insert into auth.users (id, email, is_anonymous) values ('0a000000-0000-4000-8000-0000000000aa', null, true);
insert into public.generator_profiles (id, user_id, game, name, config, created_at)
values ('e1000000-0000-4000-8000-0000000000aa', '0a000000-0000-4000-8000-0000000000aa', 'lotto', '익명 프리셋', '{}', '2026-11-01 10:00+09');
