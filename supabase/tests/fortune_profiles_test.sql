-- task-040 fortune_profiles 회귀 테스트 (RLS · 열 권한 · CHECK 경계 · CASCADE)
-- 시드에 기대지 않는다: 트랜잭션 안에서 사용자 A·B와 각자의 행을 넣고 끝에 rollback.
-- A = ...a001, B = ...b001.
begin;
create extension if not exists pgtap with schema extensions;

select plan(53);

select ok((select relrowsecurity from pg_class where oid = 'public.fortune_profiles'::regclass), 'fortune_profiles RLS 활성');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000a001', 'a@synthetic.invalid'),
  ('00000000-0000-4000-8000-00000000b001', 'b@synthetic.invalid');

-- 각자 자기 행 -------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}', true);
select lives_ok($$insert into public.fortune_profiles (user_id, birth_date, calendar, birth_hour)
  values ('00000000-0000-4000-8000-00000000a001', '1990-05-17', 'solar', 'ja')$$, 'A INSERT(양력·자시)');
select isnt((select consented_at from public.fortune_profiles), null, 'consented_at DEFAULT now()');
select is((select updated_at from public.fortune_profiles), null, 'INSERT 직후 updated_at NULL');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b001","role":"authenticated"}', true);
select lives_ok($$insert into public.fortune_profiles (user_id, birth_date, calendar, is_leap_month)
  values ('00000000-0000-4000-8000-00000000b001', '1985-04-30', 'lunar', true)$$, 'B INSERT(음력 윤달·시진 모름)');

-- B 관점: A 행 0행 · 쓰기 거부 --------------------------------------------------------
select is((select count(*) from public.fortune_profiles where user_id = '00000000-0000-4000-8000-00000000a001'), 0::bigint,
  'B: A 행 SELECT 0행');
select is((select count(*) from public.fortune_profiles), 1::bigint, 'B: 본인 1행만');
with u as (update public.fortune_profiles set birth_hour = 'o'
  where user_id = '00000000-0000-4000-8000-00000000a001' returning 1)
select is(count(*), 0::bigint, 'B: A 행 UPDATE 0행') from u;
with d as (delete from public.fortune_profiles where user_id = '00000000-0000-4000-8000-00000000a001' returning 1)
select is(count(*), 0::bigint, 'B: A 행 DELETE 0행') from d;
select throws_ok($$insert into public.fortune_profiles (user_id, birth_date, calendar)
  values ('00000000-0000-4000-8000-00000000a001', '1990-01-01', 'solar')$$, '42501', null, 'B: A user_id INSERT 거부');
select throws_ok($$update public.fortune_profiles set user_id = '00000000-0000-4000-8000-00000000a001'$$,
  '42501', null, 'user_id 다른 uid로 변경 UPDATE 거부(RLS WITH CHECK)');
select throws_ok($$update public.fortune_profiles set consented_at = now()$$, '42501', null, 'consented_at UPDATE 거부(서버 값)');
select throws_ok($$update public.fortune_profiles set updated_at = now()$$, '42501', null, 'updated_at 직접 UPDATE 거부');
select throws_ok($$insert into public.fortune_profiles (user_id, birth_date, calendar, consented_at)
  values ('00000000-0000-4000-8000-00000000b001', '1990-01-01', 'solar', now())$$, '42501', null, 'consented_at INSERT 지정 거부');

-- A-17 PUT 경로: PostgREST 모양 upsert (SET에 user_id 포함) ---------------------------
select lives_ok($$insert into public.fortune_profiles (user_id, birth_date, calendar, is_leap_month, birth_hour)
  values ('00000000-0000-4000-8000-00000000b001', '1985-04-30', 'lunar', true, null)
  on conflict (user_id) do update set user_id = excluded.user_id, birth_date = excluded.birth_date,
    calendar = excluded.calendar, is_leap_month = excluded.is_leap_month, birth_hour = excluded.birth_hour$$,
  'B PostgREST 모양 upsert(SET user_id = excluded.user_id) 통과');
select is((select count(*) from public.fortune_profiles), 1::bigint, 'PostgREST 모양 upsert 후 1행');
-- upsert on_conflict=user_id (SET에 user_id 없음)
select lives_ok($$insert into public.fortune_profiles (user_id, birth_date, calendar, is_leap_month, birth_hour)
  values ('00000000-0000-4000-8000-00000000b001', '1985-05-01', 'solar', false, 'hae')
  on conflict (user_id) do update set birth_date = excluded.birth_date, calendar = excluded.calendar,
    is_leap_month = excluded.is_leap_month, birth_hour = excluded.birth_hour$$, 'B upsert(on_conflict=user_id) 42501 없음');
select is((select birth_date || '/' || calendar || '/' || birth_hour from public.fortune_profiles), '1985-05-01/solar/hae',
  'upsert 결과 반영');
select isnt((select updated_at from public.fortune_profiles), null, 'UPDATE 시 updated_at 트리거 설정');
select is((select count(*) from public.fortune_profiles), 1::bigint, 'upsert 후에도 1행');
select throws_ok($$insert into public.fortune_profiles (user_id, birth_date, calendar)
  values ('00000000-0000-4000-8000-00000000a001', '1990-01-01', 'solar')
  on conflict (user_id) do update set birth_date = excluded.birth_date$$, '42501', null, 'B: A user_id upsert 거부');

-- CHECK 경계 벡터 (B 본인 행 UPDATE) ---------------------------------------------------
select lives_ok($$update public.fortune_profiles set birth_date = '2000-02-29', calendar = 'solar', is_leap_month = false$$,
  '양력 2000-02-29(윤년) 허용');
select throws_ok($$update public.fortune_profiles set birth_date = '2001-02-29', calendar = 'solar', is_leap_month = false$$,
  '23514', null, '양력 2001-02-29(평년) 거부');
select throws_ok($$update public.fortune_profiles set birth_date = '2000-02-30', calendar = 'solar', is_leap_month = false$$,
  '23514', null, '양력 02-30 거부');
select throws_ok($$update public.fortune_profiles set birth_date = '2000-04-31', calendar = 'solar', is_leap_month = false$$,
  '23514', null, '양력 04-31 거부');
select lives_ok($$update public.fortune_profiles set birth_date = '2000-02-30', calendar = 'lunar', is_leap_month = false$$,
  '음력 02-30 허용');
select throws_ok($$update public.fortune_profiles set birth_date = '2000-02-31', calendar = 'lunar', is_leap_month = false$$,
  '23514', null, '음력 31일 거부');
select throws_ok($$update public.fortune_profiles set birth_date = '2000-13-01', calendar = 'lunar', is_leap_month = false$$,
  '23514', null, '음력 13월 거부');
select throws_ok($$update public.fortune_profiles set birth_date = '2000-00-10', calendar = 'lunar', is_leap_month = false$$,
  '23514', null, '음력 00월 거부');
select throws_ok($$update public.fortune_profiles set birth_date = '2000-02-00', calendar = 'lunar', is_leap_month = false$$,
  '23514', null, '음력 00일 거부');
select lives_ok($$update public.fortune_profiles set birth_date = '2000-02-10', calendar = 'lunar', is_leap_month = true$$,
  '음력 윤달 허용');
select throws_ok($$update public.fortune_profiles set birth_date = '2000-02-10', calendar = 'solar', is_leap_month = true$$,
  '23514', null, '양력 + 윤달 거부');
select throws_ok($$update public.fortune_profiles set birth_date = '1899-12-31', calendar = 'solar', is_leap_month = false$$,
  '23514', null, '양력 1899-12-31 거부');
select throws_ok($$update public.fortune_profiles set birth_date = '1899-12-30', calendar = 'lunar', is_leap_month = false$$,
  '23514', null, '음력 1899-12-30 거부');
select lives_ok($$update public.fortune_profiles set birth_date = '1900-01-01', calendar = 'solar', is_leap_month = false$$,
  '양력 1900-01-01 허용');
select lives_ok(format('update public.fortune_profiles set birth_date = %L, calendar = %L, is_leap_month = false',
  to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD'), 'solar'), 'KST 오늘 허용');
select throws_ok(format('update public.fortune_profiles set birth_date = %L, calendar = %L, is_leap_month = false',
  to_char((now() at time zone 'Asia/Seoul')::date + 1, 'YYYY-MM-DD'), 'solar'), '23514', null, 'KST 내일 거부(양력)');
select throws_ok(format('update public.fortune_profiles set birth_date = %L, calendar = %L, is_leap_month = false',
  to_char((now() at time zone 'Asia/Seoul')::date + 1, 'YYYY-MM-DD'), 'lunar'), '23514', null, 'KST 내일 거부(음력)');
select throws_ok($$update public.fortune_profiles set birth_date = '2000-2-01', calendar = 'solar', is_leap_month = false$$,
  '23514', null, '형식 2000-2-01 거부');
select throws_ok($$update public.fortune_profiles set birth_date = '20000201', calendar = 'solar', is_leap_month = false$$,
  '23514', null, '형식 20000201 거부');
select throws_ok($$update public.fortune_profiles set birth_date = '2000-02-01', calendar = 'Solar', is_leap_month = false$$,
  '23514', null, 'calendar 허용값 외 거부');
select throws_ok($$update public.fortune_profiles set birth_date = '2000-02-01', calendar = 'solar', is_leap_month = false, birth_hour = 'xx'$$,
  '23514', null, '잘못된 시진 거부');
select throws_ok($$update public.fortune_profiles set birth_date = '2000-02-01', calendar = 'solar', is_leap_month = false, birth_hour = 'JA'$$,
  '23514', null, '시진 대문자 거부');
select lives_ok($$update public.fortune_profiles set birth_date = '2000-02-01', calendar = 'solar', is_leap_month = false, birth_hour = 'chuk'$$,
  '12시진 ID 허용');
select lives_ok($$update public.fortune_profiles set birth_hour = null$$, '시진 NULL(모름) 허용');

-- A: 본인 DELETE ----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}', true);
with d as (delete from public.fortune_profiles returning user_id)
select is((select count(*) from d where user_id = '00000000-0000-4000-8000-00000000a001'), 1::bigint, 'A 본인 행 DELETE');
reset role;

-- anon: 전부 거부 ----------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.fortune_profiles$$, '42501', null, 'anon SELECT 거부');
select throws_ok($$insert into public.fortune_profiles (user_id, birth_date, calendar)
  values ('00000000-0000-4000-8000-00000000a001', '1990-01-01', 'solar')$$, '42501', null, 'anon INSERT 거부');
select throws_ok($$update public.fortune_profiles set birth_hour = 'o'$$, '42501', null, 'anon UPDATE 거부');
select throws_ok($$delete from public.fortune_profiles$$, '42501', null, 'anon DELETE 거부');
reset role;

-- service_role: 접근 없음 ----------------------------------------------------------
set local role service_role;
select throws_ok($$select * from public.fortune_profiles$$, '42501', null, 'service_role SELECT 없음');
reset role;

-- 계정 삭제 → CASCADE 파기 ----------------------------------------------------------
select is((select count(*) from public.fortune_profiles where user_id = '00000000-0000-4000-8000-00000000b001'), 1::bigint,
  '삭제 전 B 행 존재');
delete from auth.users where id = '00000000-0000-4000-8000-00000000b001';
select is((select count(*) from public.fortune_profiles where user_id = '00000000-0000-4000-8000-00000000b001'), 0::bigint,
  '계정 삭제 시 B 행 CASCADE 파기');

select * from finish();
rollback;
