-- task-043a user_consents 회귀 테스트 (RLS · 열 권한 · 추가 전용 · CHECK · CASCADE)
-- 시드에 기대지 않는다: 트랜잭션 안에서 사용자 A·B와 각자의 행을 넣고 끝에 rollback.
-- A = ...a001, B = ...b001.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

select ok((select relrowsecurity from pg_class where oid = 'public.user_consents'::regclass), 'user_consents RLS 활성');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000a001', 'a@synthetic.invalid'),
  ('00000000-0000-4000-8000-00000000b001', 'b@synthetic.invalid');

-- 각자 자기 행 -------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}', true);
select lives_ok($$insert into public.user_consents (user_id, terms_version, privacy_version, adult_confirmed)
  values ('00000000-0000-4000-8000-00000000a001', '2026-11-13', '2026-11-13', true)$$, 'A INSERT');
select is((select consented_at from public.user_consents), transaction_timestamp(), 'consented_at = transaction_timestamp() (DEFAULT now())');
select lives_ok($$insert into public.user_consents (user_id, terms_version, privacy_version, adult_confirmed)
  values ('00000000-0000-4000-8000-00000000a001', '2027-01-01', '2026-11-13', true)$$, 'A 재동의(새 버전) 새 행');
select is((select count(*) from public.user_consents), 2::bigint, 'A 본인 2행');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b001","role":"authenticated"}', true);
select lives_ok($$insert into public.user_consents (user_id, terms_version, privacy_version, adult_confirmed)
  values ('00000000-0000-4000-8000-00000000b001', '2026-11-13', '2026-11-13', true)$$, 'B INSERT');

-- B 관점: A 행 0행 · 쓰기 거부 --------------------------------------------------------
select is((select count(*) from public.user_consents where user_id = '00000000-0000-4000-8000-00000000a001'), 0::bigint,
  'B: A 행 SELECT 0행');
select is((select count(*) from public.user_consents), 1::bigint, 'B: 본인 1행만');
select throws_ok($$insert into public.user_consents (user_id, terms_version, privacy_version, adult_confirmed)
  values ('00000000-0000-4000-8000-00000000a001', '2026-11-13', '2026-11-13', true)$$, '42501', null, 'B: A user_id INSERT 거부(user_id 위조)');
select throws_ok($$insert into public.user_consents (user_id, terms_version, privacy_version, adult_confirmed, consented_at)
  values ('00000000-0000-4000-8000-00000000b001', '2026-11-13', '2026-11-13', true, '2000-01-01')$$, '42501', null,
  'consented_at INSERT 지정 거부(서버 값)');
select throws_ok($$insert into public.user_consents (id, user_id, terms_version, privacy_version, adult_confirmed)
  values (gen_random_uuid(), '00000000-0000-4000-8000-00000000b001', '2026-11-13', '2026-11-13', true)$$, '42501', null,
  'id INSERT 지정 거부');

-- 추가 전용: UPDATE·DELETE 권한 없음 ---------------------------------------------------
select throws_ok($$update public.user_consents set terms_version = 'x'$$, '42501', null, '본인 행 UPDATE 거부');
select throws_ok($$update public.user_consents set consented_at = now()$$, '42501', null, 'consented_at UPDATE 거부');
select throws_ok($$delete from public.user_consents$$, '42501', null, '본인 행 DELETE 거부');

-- CHECK -------------------------------------------------------------------------
select throws_ok($$insert into public.user_consents (user_id, terms_version, privacy_version, adult_confirmed)
  values ('00000000-0000-4000-8000-00000000b001', '2026-11-13', '2026-11-13', false)$$, '23514', null, '만 19세 미확인(false) 거부');
select throws_ok($$insert into public.user_consents (user_id, terms_version, privacy_version, adult_confirmed)
  values ('00000000-0000-4000-8000-00000000b001', '2026-11-13', '2026-11-13', null)$$, '23502', null, 'adult_confirmed NULL 거부');
select throws_ok($$insert into public.user_consents (user_id, terms_version, privacy_version, adult_confirmed)
  values ('00000000-0000-4000-8000-00000000b001', '', '2026-11-13', true)$$, '23514', null, '빈 약관 버전 거부');
select throws_ok(format($$insert into public.user_consents (user_id, terms_version, privacy_version, adult_confirmed)
  values ('00000000-0000-4000-8000-00000000b001', '2026-11-13', %L, true)$$, repeat('x', 33)), '23514', null, '33자 개인정보 버전 거부');
reset role;

-- anon: 전부 거부 ----------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.user_consents$$, '42501', null, 'anon SELECT 거부');
select throws_ok($$insert into public.user_consents (user_id, terms_version, privacy_version, adult_confirmed)
  values ('00000000-0000-4000-8000-00000000a001', '2026-11-13', '2026-11-13', true)$$, '42501', null, 'anon INSERT 거부');
select throws_ok($$update public.user_consents set terms_version = 'x'$$, '42501', null, 'anon UPDATE 거부');
select throws_ok($$delete from public.user_consents$$, '42501', null, 'anon DELETE 거부');
reset role;

-- service_role: 접근 없음 ----------------------------------------------------------
set local role service_role;
select throws_ok($$select * from public.user_consents$$, '42501', null, 'service_role SELECT 없음');
reset role;

-- 계정 삭제 → CASCADE 파기 ----------------------------------------------------------
select is((select count(*) from public.user_consents where user_id = '00000000-0000-4000-8000-00000000a001'), 2::bigint,
  '삭제 전 A 행 2개');
delete from auth.users where id = '00000000-0000-4000-8000-00000000a001';
select is((select count(*) from public.user_consents where user_id = '00000000-0000-4000-8000-00000000a001'), 0::bigint,
  '계정 삭제 시 A 행 CASCADE 파기');
select is((select count(*) from public.user_consents where user_id = '00000000-0000-4000-8000-00000000b001'), 1::bigint,
  'B 행은 유지');

select * from finish();
rollback;
