-- task-008 사용자 스키마 회귀 테스트
-- (generator_profiles · generated_batches · generated_numbers · saved_tickets · draw_checks)
-- 시드에 기대지 않는다: 트랜잭션 안에서 사용자 A·B와 각자의 행을 넣고 끝에 rollback.
-- A = ...a001, B = ...b001. 두 사용자 모두 자기 행을 가진 상태에서 교차 접근을 검사한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(244);

-- RLS 활성 ---------------------------------------------------------------------
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relrowsecurity
      and c.relname in ('generator_profiles', 'generated_batches', 'generated_numbers', 'saved_tickets', 'draw_checks')),
  5::bigint, '5개 사용자 테이블 RLS 활성');

-- 사용자 (소유자 권한) ------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000a001', 'a@synthetic.invalid'),
  ('00000000-0000-4000-8000-00000000b001', 'b@synthetic.invalid');

-- A의 자체 데이터 ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}', true);
select lives_ok($$insert into public.generator_profiles (id, user_id, game, name, config)
  values ('10000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a001', 'lotto', 'A 프리셋', '{"k":1}')$$,
  'A generator_profiles INSERT');
select lives_ok($$insert into public.generated_batches (id, user_id, game, round, strategy, engine_version)
  values ('20000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a001', 'lotto', 1200, 'balanced', 't1')$$,
  'A generated_batches(로또) INSERT');
select lives_ok($$insert into public.generated_batches (id, user_id, game, round, strategy, method, engine_version)
  values ('20000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a001', 'pension', 300, 'random', 'saju', 't1')$$,
  'A generated_batches(연금) INSERT');
select lives_ok($$insert into public.generated_numbers (id, batch_id, game, line_no, numbers)
  values ('30000000-0000-4000-8000-00000000a001', '20000000-0000-4000-8000-00000000a001', 'lotto', 1, '{"nums":[1,2,3,4,5,45]}')$$,
  'A generated_numbers(로또) INSERT');
select lives_ok($$insert into public.generated_numbers (id, batch_id, game, line_no, numbers, group_no)
  values ('30000000-0000-4000-8000-00000000a002', '20000000-0000-4000-8000-00000000a002', 'pension', 1, '{"digits":"000719"}', 1)$$,
  'A generated_numbers(연금, 앞자리 0) INSERT');
select lives_ok($$insert into public.saved_tickets (id, user_id, game, round, ticket_data, purchase_status, source_number_id, idempotency_key)
  values ('40000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a001', 'lotto', 1200,
          '{"nums":[1,2,3,4,5,45]}', 'favorite', '30000000-0000-4000-8000-00000000a001', '60000000-0000-4000-8000-00000000a001')$$,
  'A saved_tickets(favorite, 본인 source_number_id) INSERT');
select lives_ok($$insert into public.saved_tickets (id, user_id, game, round, ticket_data, purchase_status, purchase_date, amount_won, idempotency_key)
  values ('40000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a001', 'pension', 300,
          '{"group_no":1,"digits":"000719"}', 'purchased', '2099-01-01', 1000, '60000000-0000-4000-8000-00000000a002')$$,
  'A saved_tickets(연금 purchased) INSERT');

-- B의 자체 데이터 ---------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b001","role":"authenticated"}', true);
select lives_ok($$insert into public.generator_profiles (id, user_id, game, name, config)
  values ('10000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b001', 'pension', 'B 프리셋', '{}')$$,
  'B generator_profiles INSERT');
select lives_ok($$insert into public.generated_batches (id, user_id, game, strategy, engine_version)
  values ('20000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b001', 'lotto', 'random', 't1')$$,
  'B generated_batches INSERT');
select lives_ok($$insert into public.generated_numbers (id, batch_id, game, line_no, numbers)
  values ('30000000-0000-4000-8000-00000000b001', '20000000-0000-4000-8000-00000000b001', 'lotto', 1, '{"nums":[7,8,9,10,11,12]}')$$,
  'B generated_numbers INSERT');
select lives_ok($$insert into public.saved_tickets (id, user_id, game, round, ticket_data, purchase_status, purchase_date, idempotency_key)
  values ('40000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b001', 'lotto', 1200,
          '{"nums":[7,8,9,10,11,12]}', 'purchased', '2099-01-02', '60000000-0000-4000-8000-00000000b001')$$,
  'B saved_tickets(purchased, amount_won NULL 허용) INSERT');
reset role;

-- 판정 이력: service_role만 기록 ------------------------------------------------
set local role service_role;
select lives_ok($$insert into public.draw_checks (id, ticket_id, game, draw_no, matched_rank, bonus_hit, checked_at)
  values ('50000000-0000-4000-8000-00000000a001', '40000000-0000-4000-8000-00000000a002', 'pension', 300, null, true, now())$$,
  'service_role draw_checks(A 연금 보너스) INSERT');
select lives_ok($$insert into public.draw_checks (id, ticket_id, game, draw_no, matched_rank, checked_at)
  values ('50000000-0000-4000-8000-00000000b001', '40000000-0000-4000-8000-00000000b001', 'lotto', 1200, 5, now())$$,
  'service_role draw_checks(B 로또 5등) INSERT');
select throws_ok($$insert into public.draw_checks (ticket_id, game, draw_no, bonus_hit, checked_at)
  values ('40000000-0000-4000-8000-00000000b001', 'lotto', 1200, true, now())$$,
  '23514', null, '로또 bonus_hit true 거부');
select throws_ok($$insert into public.draw_checks (ticket_id, game, draw_no, checked_at)
  values ('40000000-0000-4000-8000-00000000b001', 'pension', 1200, now())$$,
  '23503', null, 'draw_checks game이 티켓과 다르면 거부(복합 FK)');
select throws_ok($$update public.draw_checks set matched_rank = 1$$, '42501', null, 'service_role draw_checks UPDATE 거부(누적 이력)');
select throws_ok($$delete from public.draw_checks$$, '42501', null, 'service_role draw_checks DELETE 거부');
select is((select count(*) from public.saved_tickets), 3::bigint, 'service_role saved_tickets SELECT(A-09 판정용)');
select throws_ok($$select * from public.generated_batches$$, '42501', null, 'service_role generated_batches 접근 없음');
reset role;

-- B 관점: A 행 SELECT 0행 ---------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b001","role":"authenticated"}', true);
select is((select count(*) from public.generator_profiles where user_id = '00000000-0000-4000-8000-00000000a001'), 0::bigint,
  'B: A generator_profiles 0행');
select is((select count(*) from public.generated_batches where user_id = '00000000-0000-4000-8000-00000000a001'), 0::bigint,
  'B: A generated_batches 0행');
select is((select count(*) from public.generated_numbers where batch_id in
  ('20000000-0000-4000-8000-00000000a001', '20000000-0000-4000-8000-00000000a002')), 0::bigint, 'B: A generated_numbers 0행');
select is((select count(*) from public.saved_tickets where user_id = '00000000-0000-4000-8000-00000000a001'), 0::bigint,
  'B: A saved_tickets 0행');
select is((select count(*) from public.draw_checks where ticket_id = '40000000-0000-4000-8000-00000000a002'), 0::bigint,
  'B: A draw_checks 0행');
select is((select count(*) from public.generator_profiles), 1::bigint, 'B: 본인 generator_profiles 1행');
select is((select count(*) from public.generated_numbers), 1::bigint, 'B: 본인 generated_numbers 1행');
select is((select count(*) from public.saved_tickets), 1::bigint, 'B: 본인 saved_tickets 1행');
select is((select count(*) from public.draw_checks), 1::bigint, 'B: 본인 draw_checks 1행');

-- B 관점: A 행 UPDATE·DELETE 0행 ---------------------------------------------------
with u as (update public.generator_profiles set name = 'x' where id = '10000000-0000-4000-8000-00000000a001' returning 1)
select is(count(*), 0::bigint, 'B: A generator_profiles UPDATE 0행') from u;
with u as (update public.saved_tickets set purchase_status = 'purchased', purchase_date = '2099-01-01'
  where id = '40000000-0000-4000-8000-00000000a001' returning 1)
select is(count(*), 0::bigint, 'B: A saved_tickets UPDATE 0행') from u;
with d as (delete from public.generator_profiles where id = '10000000-0000-4000-8000-00000000a001' returning 1)
select is(count(*), 0::bigint, 'B: A generator_profiles DELETE 0행') from d;
with d as (delete from public.generated_batches where id = '20000000-0000-4000-8000-00000000a001' returning 1)
select is(count(*), 0::bigint, 'B: A generated_batches DELETE 0행') from d;
with d as (delete from public.generated_numbers where id = '30000000-0000-4000-8000-00000000a001' returning 1)
select is(count(*), 0::bigint, 'B: A generated_numbers DELETE 0행') from d;
with d as (delete from public.saved_tickets where id = '40000000-0000-4000-8000-00000000a001' returning 1)
select is(count(*), 0::bigint, 'B: A saved_tickets DELETE 0행') from d;

-- B 관점: 남의 user_id·남의 배치로 INSERT 거부 -----------------------------------------
select throws_ok($$insert into public.generator_profiles (user_id, game, name, config)
  values ('00000000-0000-4000-8000-00000000a001', 'lotto', 'x', '{}')$$, '42501', null, 'B: A user_id generator_profiles INSERT 거부');
select throws_ok($$insert into public.generated_batches (user_id, game, strategy, engine_version)
  values ('00000000-0000-4000-8000-00000000a001', 'lotto', 'x', 't')$$, '42501', null, 'B: A user_id generated_batches INSERT 거부');
select throws_ok($$insert into public.generated_numbers (batch_id, game, line_no, numbers)
  values ('20000000-0000-4000-8000-00000000a001', 'lotto', 9, '{"nums":[1,2,3,4,5,6]}')$$, '42501', null, 'B: A 배치에 generated_numbers INSERT 거부');
select throws_ok($$insert into public.saved_tickets (user_id, game, ticket_data, purchase_status, idempotency_key)
  values ('00000000-0000-4000-8000-00000000a001', 'lotto', '{"nums":[1,2,3,4,5,6]}', 'favorite', gen_random_uuid())$$,
  '42501', null, 'B: A user_id saved_tickets INSERT 거부');
select throws_ok($$insert into public.saved_tickets (user_id, game, ticket_data, purchase_status, source_number_id, idempotency_key)
  values ('00000000-0000-4000-8000-00000000b001', 'lotto', '{"nums":[1,2,3,4,5,45]}', 'favorite',
          '30000000-0000-4000-8000-00000000a001', gen_random_uuid())$$,
  '23503', 'INVALID_SOURCE_NUMBER', 'B: A의 generated_number를 source_number_id로 거부');
select throws_ok($$insert into public.saved_tickets (user_id, game, ticket_data, purchase_status, source_number_id, idempotency_key)
  values ('00000000-0000-4000-8000-00000000b001', 'lotto', '{"nums":[1,2,3,4,5,45]}', 'favorite',
          '30000000-0000-4000-8000-0000000fffff', gen_random_uuid())$$,
  '23503', 'INVALID_SOURCE_NUMBER', '존재하지 않는 source_number_id도 같은 오류(존재 여부 오라클 없음)');
select throws_ok($$insert into public.draw_checks (ticket_id, game, draw_no, checked_at)
  values ('40000000-0000-4000-8000-00000000b001', 'lotto', 1200, now())$$, '42501', null, '사용자 draw_checks INSERT 거부(본인 티켓)');

-- 불변 열·추가 전용 UPDATE 거부 ----------------------------------------------------------
select throws_ok($$update public.generator_profiles set user_id = '00000000-0000-4000-8000-00000000a001'
  where id = '10000000-0000-4000-8000-00000000b001'$$, '42501', null, 'generator_profiles user_id 변경 거부(열 권한)');
select throws_ok($$update public.generator_profiles set game = 'lotto'
  where id = '10000000-0000-4000-8000-00000000b001'$$, '42501', null, 'generator_profiles game 변경 거부(열 권한)');
select throws_ok($$update public.generator_profiles set id = gen_random_uuid()
  where id = '10000000-0000-4000-8000-00000000b001'$$, '42501', null, 'generator_profiles id 변경 거부(열 권한)');
select throws_ok($$update public.generated_batches set strategy = 'x'$$, '42501', null, 'generated_batches UPDATE 거부');
select throws_ok($$update public.generated_numbers set batch_id = '20000000-0000-4000-8000-00000000b001'$$, '42501', null,
  'generated_numbers batch_id 변경 거부');
select throws_ok($$update public.draw_checks set ticket_id = '40000000-0000-4000-8000-00000000b001'$$, '42501', null,
  '사용자 draw_checks ticket_id 변경 거부');
select throws_ok($$delete from public.draw_checks$$, '42501', null, '사용자 draw_checks DELETE 거부');
select throws_ok($$update public.saved_tickets set user_id = '00000000-0000-4000-8000-00000000a001'
  where id = '40000000-0000-4000-8000-00000000b001'$$, '42501', null, 'saved_tickets user_id 변경 거부(열 권한)');
select throws_ok($$update public.saved_tickets set ticket_data = '{"nums":[1,2,3,4,5,6]}'
  where id = '40000000-0000-4000-8000-00000000b001'$$, '42501', null, 'saved_tickets ticket_data 변경 거부(열 권한)');
select throws_ok($$update public.saved_tickets set idempotency_key = gen_random_uuid()
  where id = '40000000-0000-4000-8000-00000000b001'$$, '42501', null, 'saved_tickets idempotency_key 변경 거부(열 권한)');
select throws_ok($$update public.saved_tickets set game = 'pension'
  where id = '40000000-0000-4000-8000-00000000b001'$$, '42501', null, 'saved_tickets game 변경 거부(열 권한)');
select throws_ok($$update public.saved_tickets set round = 1
  where id = '40000000-0000-4000-8000-00000000b001'$$, '42501', null, 'saved_tickets round 변경 거부(열 권한)');
select throws_ok($$update public.saved_tickets set source_number_id = null
  where id = '40000000-0000-4000-8000-00000000b001'$$, '42501', null, 'saved_tickets source_number_id 변경 거부(열 권한)');

-- 상태 전환 ---------------------------------------------------------------------
select throws_ok($$update public.saved_tickets set purchase_status = 'favorite', purchase_date = null, amount_won = null
  where id = '40000000-0000-4000-8000-00000000b001'$$, 'PT422', 'INVALID_TRANSITION', 'purchased→favorite 역전환 PT422');
select lives_ok($$update public.saved_tickets set amount_won = 2000
  where id = '40000000-0000-4000-8000-00000000b001'$$, 'purchased 금액 수정 허용');
select throws_ok($$update public.saved_tickets set amount_won = -1
  where id = '40000000-0000-4000-8000-00000000b001'$$, '23514', null, 'amount_won 음수 거부');

-- 멱등 키 (R18) -----------------------------------------------------------------
select throws_ok($$insert into public.saved_tickets (user_id, game, ticket_data, purchase_status, idempotency_key)
  values ('00000000-0000-4000-8000-00000000b001', 'lotto', '{"nums":[1,2,3,4,5,6]}', 'favorite',
          '60000000-0000-4000-8000-00000000b001')$$, '23505', null, '같은 idempotency_key 두 번째 INSERT 거부');

-- 상태-열 CHECK ------------------------------------------------------------------
select throws_ok($$insert into public.saved_tickets (user_id, game, ticket_data, purchase_status, purchase_date, idempotency_key)
  values ('00000000-0000-4000-8000-00000000b001', 'lotto', '{"nums":[1,2,3,4,5,6]}', 'favorite', '2099-01-01', gen_random_uuid())$$,
  '23514', null, 'favorite에 purchase_date 거부');
select throws_ok($$insert into public.saved_tickets (user_id, game, ticket_data, purchase_status, amount_won, idempotency_key)
  values ('00000000-0000-4000-8000-00000000b001', 'lotto', '{"nums":[1,2,3,4,5,6]}', 'favorite', 1000, gen_random_uuid())$$,
  '23514', null, 'favorite에 amount_won 거부');
select throws_ok($$insert into public.saved_tickets (user_id, game, ticket_data, purchase_status, idempotency_key)
  values ('00000000-0000-4000-8000-00000000b001', 'lotto', '{"nums":[1,2,3,4,5,6]}', 'purchased', gen_random_uuid())$$,
  '23514', null, 'purchased에 purchase_date 없으면 거부');
select throws_ok($$insert into public.saved_tickets (user_id, game, ticket_data, purchase_status, idempotency_key)
  values ('00000000-0000-4000-8000-00000000b001', 'lotto', '{"nums":[1,2,3,4,5,6]}', 'sold', gen_random_uuid())$$,
  '23514', null, '알 수 없는 purchase_status 거부');

-- valid_ticket 우회 케이스 (모두 23514) ---------------------------------------------
select throws_ok(format($$insert into public.saved_tickets (user_id, game, ticket_data, purchase_status, idempotency_key)
  values ('00000000-0000-4000-8000-00000000b001', %L, %L, 'favorite', gen_random_uuid())$$, c.game, c.data),
  '23514', null, 'valid_ticket 거부: ' || c.label)
from (values
  ('lotto',   '{"nums":["7",8,9,10,11,12]}',              '로또 "7" 문자열'),
  ('lotto',   '{"nums":[1.5,8,9,10,11,12]}',              '로또 1.5'),
  ('lotto',   '{"nums":[1,2,3,4,5,6],"x":1}',             '로또 추가 키'),
  ('lotto',   '{"nums":[1,1,3,4,5,6]}',                   '로또 중복'),
  ('lotto',   '{"nums":[1,2,3,4,5]}',                     '로또 5개'),
  ('lotto',   '{"nums":[1,2,3,4,5,46]}',                  '로또 46'),
  ('lotto',   '{"nums":[0,2,3,4,5,6]}',                   '로또 0'),
  ('lotto',   '{"nums":[6,5,4,3,2,1]}',                   '로또 내림차순'),
  ('lotto',   '{"nums":[1,2,3,4,5,null]}',                '로또 null 요소'),
  ('lotto',   '[1,2,3,4,5,6]',                            '로또 배열 최상위'),
  ('lotto',   '{"group_no":1,"digits":"000719"}',         '로또 게임에 연금 형식'),
  ('pension', '{"group_no":1,"digits":719}',              '연금 digits 숫자형'),
  ('pension', '{"group_no":1,"digits":"00071"}',          '연금 digits 5자리'),
  ('pension', '{"group_no":1,"digits":"00071a"}',         '연금 digits 비숫자'),
  ('pension', '{"group_no":6,"digits":"000719"}',         '연금 group_no 6'),
  ('pension', '{"group_no":"1","digits":"000719"}',       '연금 group_no 문자열'),
  ('pension', '{"group_no":1.5,"digits":"000719"}',       '연금 group_no 1.5'),
  ('pension', '{"group_no":1,"digits":"000719","x":1}',   '연금 추가 키'),
  ('pension', '{"digits":"000719"}',                      '연금 group_no 누락')
) c(game, data, label);

-- valid_numbers·생성 번호 CHECK --------------------------------------------------------
select throws_ok($$insert into public.generated_numbers (batch_id, game, line_no, numbers)
  values ('20000000-0000-4000-8000-00000000b001', 'lotto', 2, '{"nums":["7",8,9,10,11,12]}')$$, '23514', null,
  'generated_numbers 로또 "7" 문자열 거부');
select throws_ok($$insert into public.generated_numbers (batch_id, game, line_no, numbers)
  values ('20000000-0000-4000-8000-00000000b001', 'lotto', 2, '{"nums":[1,2,3,4,5,6],"x":1}')$$, '23514', null,
  'generated_numbers 추가 키 거부');
select throws_ok($$insert into public.generated_numbers (batch_id, game, line_no, numbers, group_no)
  values ('20000000-0000-4000-8000-00000000b001', 'lotto', 2, '{"nums":[1,2,3,4,5,6]}', 1)$$, '23514', null,
  'generated_numbers 로또에 group_no 거부');
select throws_ok($$insert into public.generated_numbers (batch_id, game, line_no, numbers, group_no)
  values ('20000000-0000-4000-8000-00000000b001', 'pension', 2, '{"digits":"000719"}', 1)$$, '23503', null,
  'generated_numbers game이 배치와 다르면 거부(복합 FK)');
select throws_ok($$insert into public.generated_numbers (batch_id, game, line_no, numbers)
  values ('20000000-0000-4000-8000-00000000b001', 'lotto', 1, '{"nums":[1,2,3,4,5,6]}')$$, '23505', null,
  'generated_numbers 같은 (batch_id, line_no) 거부');
select throws_ok($$insert into public.generated_batches (user_id, game, strategy, method, engine_version)
  values ('00000000-0000-4000-8000-00000000b001', 'lotto', 'x', 'tarot', 't')$$, '23514', null, 'generated_batches 알 수 없는 method 거부');
select throws_ok($$insert into public.generated_batches (user_id, game, strategy, engine_version)
  values ('00000000-0000-4000-8000-00000000b001', 'lotto', repeat('s', 65), 't')$$, '23514',
  'new row for relation "generated_batches" violates check constraint "generated_batches_strategy_len_chk"', 'strategy 65자 거부');
select throws_ok($$insert into public.generated_batches (user_id, game, strategy, engine_version)
  values ('00000000-0000-4000-8000-00000000b001', 'lotto', 's', repeat('v', 65))$$, '23514',
  'new row for relation "generated_batches" violates check constraint "generated_batches_engine_version_len_chk"', 'engine_version 65자 거부');
select throws_ok($$insert into public.generated_numbers (batch_id, game, line_no, numbers)
  values ('20000000-0000-4000-8000-00000000b001', 'lotto', 0, '{"nums":[1,2,3,4,5,6]}')$$, '23514',
  'new row for relation "generated_numbers" violates check constraint "generated_numbers_line_no_chk"', 'line_no 0 거부');
select throws_ok($$insert into public.generated_numbers (batch_id, game, line_no, numbers)
  values ('20000000-0000-4000-8000-00000000b001', 'lotto', 51, '{"nums":[1,2,3,4,5,6]}')$$, '23514',
  'new row for relation "generated_numbers" violates check constraint "generated_numbers_line_no_chk"', 'line_no 51 거부(배치당 50줄)');

-- 크기 상한 ---------------------------------------------------------------------
select throws_ok($$insert into public.generator_profiles (user_id, game, name, config)
  values ('00000000-0000-4000-8000-00000000b001', 'lotto', repeat('가', 51), '{}')$$, '23514', null, 'name 51자 거부');
select lives_ok($$insert into public.generator_profiles (user_id, game, name, config)
  values ('00000000-0000-4000-8000-00000000b001', 'lotto', repeat('가', 50), '{}')$$, 'name 50자 허용');
select throws_ok($$insert into public.generator_profiles (user_id, game, name, config)
  values ('00000000-0000-4000-8000-00000000b001', 'lotto', 'x', jsonb_build_object('k', repeat('a', 4096)))$$,
  '23514', 'new row for relation "generator_profiles" violates check constraint "generator_profiles_config_size_chk"',
  'config 4096바이트 초과 거부');
select throws_ok($$insert into public.saved_tickets (user_id, game, ticket_data, purchase_status, idempotency_key)
  values ('00000000-0000-4000-8000-00000000b001', 'lotto', format('{"nums":[1,2,3,4,5,6.%s]}', repeat('0', 4100))::jsonb,
          'favorite', gen_random_uuid())$$, '23514',
  'new row for relation "saved_tickets" violates check constraint "saved_tickets_size_chk"',
  'ticket_data 4096바이트 초과 거부(nums만, 형식은 유효)');
select throws_ok($$insert into public.generated_numbers (batch_id, game, line_no, numbers)
  values ('20000000-0000-4000-8000-00000000b001', 'lotto', 3, format('{"nums":[1,2,3,4,5,6.%s]}', repeat('0', 4100))::jsonb)$$,
  '23514', 'new row for relation "generated_numbers" violates check constraint "generated_numbers_size_chk"',
  'numbers 4096바이트 초과 거부(nums만, 형식은 유효)');

-- A 관점: 허용 전환·다른 사용자 같은 멱등 키 ------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}', true);
select throws_ok($$update public.saved_tickets set purchase_status = 'purchased'
  where id = '40000000-0000-4000-8000-00000000a001'$$, '23514', null, 'favorite→purchased 전환에 purchase_date 없으면 거부');
select throws_ok($$insert into public.saved_tickets (user_id, game, ticket_data, purchase_status, idempotency_key)
  values ('00000000-0000-4000-8000-00000000a001', 'lotto', '{"nums":[7,8,9,10,11,12]}', 'favorite',
          '60000000-0000-4000-8000-00000000a001')
  on conflict (user_id, idempotency_key) do update set ticket_data = excluded.ticket_data$$,
  '42501', null, 'upsert로 ticket_data 덮어쓰기 거부(열 권한)');
select lives_ok($$update public.saved_tickets set purchase_status = 'purchased', purchase_date = '2099-01-03', amount_won = 5000
  where id = '40000000-0000-4000-8000-00000000a001'$$, 'favorite→purchased 전환 허용');
select is((select purchase_status from public.saved_tickets where id = '40000000-0000-4000-8000-00000000a001'),
  'purchased', 'A 티켓 purchased 반영');
select throws_ok($$update public.saved_tickets set purchase_status = 'favorite', purchase_date = null, amount_won = null
  where id = '40000000-0000-4000-8000-00000000a001'$$, 'PT422', 'INVALID_TRANSITION', '전환 후 다시 favorite 역전환 PT422');
select lives_ok($$insert into public.saved_tickets (user_id, game, ticket_data, purchase_status, idempotency_key)
  values ('00000000-0000-4000-8000-00000000a001', 'lotto', '{"nums":[1,2,3,4,5,6]}', 'favorite',
          '60000000-0000-4000-8000-00000000b001')$$, '다른 사용자는 같은 idempotency_key 사용 가능');
select is((select count(*) from public.draw_checks), 1::bigint, 'A: 본인 draw_checks 1행(B 행 안 보임)');
select is((select bonus_hit from public.draw_checks where id = '50000000-0000-4000-8000-00000000a001'), true,
  'A: 연금 보너스 판정 조회');

-- 생성 번호 삭제 시 source_number_id SET NULL ------------------------------------------
select lives_ok($$delete from public.generated_batches where id = '20000000-0000-4000-8000-00000000a001'$$,
  'A 본인 배치 DELETE(번호 CASCADE)');
select is((select source_number_id from public.saved_tickets where id = '40000000-0000-4000-8000-00000000a001'),
  null::uuid, '생성 번호 삭제 → saved_tickets.source_number_id NULL');
reset role;

-- anon: 전부 거부 ----------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(format('select * from public.%I', t), '42501', null, 'anon ' || t || ' SELECT 거부')
from unnest(array['generator_profiles', 'generated_batches', 'generated_numbers', 'saved_tickets', 'draw_checks']) t;
select throws_ok($$insert into public.generator_profiles (user_id, game, name, config)
  values ('00000000-0000-4000-8000-00000000a001', 'lotto', 'x', '{}')$$, '42501', null, 'anon generator_profiles INSERT 거부');
select throws_ok($$insert into public.generated_batches (user_id, game, strategy, engine_version)
  values ('00000000-0000-4000-8000-00000000a001', 'lotto', 'x', 't')$$, '42501', null, 'anon generated_batches INSERT 거부');
select throws_ok($$insert into public.saved_tickets (user_id, game, ticket_data, purchase_status, idempotency_key)
  values ('00000000-0000-4000-8000-00000000a001', 'lotto', '{"nums":[1,2,3,4,5,6]}', 'favorite', gen_random_uuid())$$,
  '42501', null, 'anon saved_tickets INSERT 거부');
select throws_ok($$update public.saved_tickets set purchase_status = 'purchased'$$, '42501', null, 'anon saved_tickets UPDATE 거부');
select throws_ok($$delete from public.saved_tickets$$, '42501', null, 'anon saved_tickets DELETE 거부');
select throws_ok($$insert into public.draw_checks (ticket_id, game, draw_no, checked_at)
  values ('40000000-0000-4000-8000-00000000a002', 'pension', 1, now())$$, '42501', null, 'anon draw_checks INSERT 거부');
reset role;

-- 티켓 삭제 → draw_checks CASCADE (B 본인 삭제) ------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b001","role":"authenticated"}', true);
select lives_ok($$delete from public.saved_tickets where id = '40000000-0000-4000-8000-00000000b001'$$, 'B 본인 티켓 DELETE');
reset role;
select is((select count(*) from public.draw_checks where ticket_id = '40000000-0000-4000-8000-00000000b001'), 0::bigint,
  '티켓 삭제 → draw_checks CASCADE');

-- 계정 삭제 → 사용자 행 CASCADE (A) ----------------------------------------------------
delete from auth.users where id = '00000000-0000-4000-8000-00000000a001';
select is((select count(*) from public.generator_profiles where user_id = '00000000-0000-4000-8000-00000000a001'), 0::bigint,
  '계정 삭제 → generator_profiles CASCADE');
select is((select count(*) from public.generated_batches where user_id = '00000000-0000-4000-8000-00000000a001'), 0::bigint,
  '계정 삭제 → generated_batches CASCADE');
select is((select count(*) from public.generated_numbers where batch_id = '20000000-0000-4000-8000-00000000a002'), 0::bigint,
  '계정 삭제 → generated_numbers CASCADE');
select is((select count(*) from public.saved_tickets where user_id = '00000000-0000-4000-8000-00000000a001'), 0::bigint,
  '계정 삭제 → saved_tickets CASCADE');
select is((select count(*) from public.draw_checks where id = '50000000-0000-4000-8000-00000000a001'), 0::bigint,
  '계정 삭제 → draw_checks CASCADE');
select is((select count(*) from public.generator_profiles where user_id = '00000000-0000-4000-8000-00000000b001'), 2::bigint,
  'B 행은 그대로');

-- 카탈로그 권한: 역할 × 테이블 × 권한 기대값 (105건) --------------------------------
select is(has_table_privilege(r.role, 'public.' || t.tbl, p.priv),
          coalesce(e.expected, false),
          format('%s %s %s = %s', r.role, t.tbl, p.priv, coalesce(e.expected, false)))
from (values ('anon'), ('authenticated'), ('service_role')) r(role)
cross join (values ('generator_profiles'), ('generated_batches'), ('generated_numbers'), ('saved_tickets'), ('draw_checks')) t(tbl)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
left join (values
  ('authenticated', 'generator_profiles', 'SELECT', true),
  ('authenticated', 'generator_profiles', 'INSERT', true),
  ('authenticated', 'generator_profiles', 'DELETE', true),
  ('authenticated', 'generated_batches',  'SELECT', true),
  ('authenticated', 'generated_batches',  'INSERT', true),
  ('authenticated', 'generated_batches',  'DELETE', true),
  ('authenticated', 'generated_numbers',  'SELECT', true),
  ('authenticated', 'generated_numbers',  'INSERT', true),
  ('authenticated', 'generated_numbers',  'DELETE', true),
  ('authenticated', 'saved_tickets',      'SELECT', true),
  ('authenticated', 'saved_tickets',      'INSERT', true),
  ('authenticated', 'saved_tickets',      'DELETE', true),
  ('authenticated', 'draw_checks',        'SELECT', true),
  ('service_role',  'saved_tickets',      'SELECT', true),
  ('service_role',  'draw_checks',        'SELECT', true),
  ('service_role',  'draw_checks',        'INSERT', true)
) e(role, tbl, priv, expected) on e.role = r.role and e.tbl = t.tbl and e.priv = p.priv
order by r.role, t.tbl, p.priv;

-- saved_tickets authenticated 열 단위 UPDATE (9건) ------------------------------------
select is(has_column_privilege('authenticated', 'public.saved_tickets', c.col, 'UPDATE'), c.expected,
          format('authenticated saved_tickets.%s UPDATE = %s', c.col, c.expected))
from (values
  ('purchase_status', true), ('purchase_date', true), ('amount_won', true),
  ('ticket_data', false), ('idempotency_key', false), ('user_id', false),
  ('game', false), ('round', false), ('source_number_id', false)
) c(col, expected);

-- 검증 함수 EXECUTE (4건) ----------------------------------------------------------
select ok(not has_function_privilege('anon', 'private.valid_ticket(public.game_type, jsonb)', 'EXECUTE'), 'anon valid_ticket EXECUTE 없음');
select ok(not has_function_privilege('anon', 'private.valid_numbers(public.game_type, jsonb)', 'EXECUTE'), 'anon valid_numbers EXECUTE 없음');
select ok(has_function_privilege('authenticated', 'private.valid_ticket(public.game_type, jsonb)', 'EXECUTE'), 'authenticated valid_ticket EXECUTE');
select ok(has_function_privilege('authenticated', 'private.valid_numbers(public.game_type, jsonb)', 'EXECUTE'), 'authenticated valid_numbers EXECUTE');

select * from finish();
rollback;
