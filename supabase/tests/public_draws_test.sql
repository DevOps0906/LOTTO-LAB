-- task-007 공개·수집 스키마 회귀 테스트 (draws_lotto · draws_pension · statistics_cache · ingestion_runs)
-- 시드에 기대지 않는다: 트랜잭션 안에서 자체 데이터(draw_no 900001~)를 넣고 끝에 rollback.
begin;
create extension if not exists pgtap with schema extensions;

select plan(156);

-- RLS 활성 ---------------------------------------------------------------------
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relrowsecurity
      and c.relname in ('ingestion_runs', 'draws_lotto', 'draws_pension', 'statistics_cache')),
  4::bigint, '4개 테이블 RLS 활성');

-- 자체 데이터 (service_role) ----------------------------------------------------
set local role service_role;
select lives_ok($$insert into public.ingestion_runs
  (id, game, draw_no, source_url, fetched_at, payload_sha256, raw_payload, status)
  values ('00000000-0000-4000-8000-0000000000aa', 'lotto', 900001, 'https://synthetic.invalid/t', now(),
          'test-sha', '{"t":1}', 'verified')$$, 'service_role ingestion_runs INSERT');
select lives_ok($$insert into public.draws_lotto
  (draw_no, draw_date, nums, bonus, prizes, source_url, ingestion_run_id, source_verified_at)
  values (900001, '2099-01-03', '{1,2,3,4,5,45}', 44, '[]', 'https://synthetic.invalid/t',
          '00000000-0000-4000-8000-0000000000aa', now())$$, 'service_role draws_lotto INSERT');
select lives_ok($$insert into public.draws_pension
  (draw_no, draw_date, group_no, digits, bonus_digits, prizes, source_url, ingestion_run_id, source_verified_at)
  values (900001, '2099-01-01', 1, '000719', '000001', '[]', 'https://synthetic.invalid/t',
          '00000000-0000-4000-8000-0000000000aa', now())$$, 'service_role draws_pension INSERT(앞자리 0)');
select lives_ok($$insert into public.statistics_cache
  (game, window_key, metric, payload, range_from, range_to, sample_size, source, updated_at)
  values ('lotto', 't-window', 't-metric', '{}', 1, 10, 10, 'test', now())$$, 'service_role statistics_cache INSERT');
reset role;

-- anon: 쓰기 전부 거부, SELECT 허용 ----------------------------------------------
set local role anon;
select throws_ok($$insert into public.draws_lotto (draw_no, draw_date, nums, bonus, prizes, source_url, ingestion_run_id, source_verified_at)
  values (900009, '2099-09-09', '{1,2,3,4,5,6}', 7, '[]', 'x', '00000000-0000-4000-8000-0000000000aa', now())$$,
  '42501', null, 'anon draws_lotto INSERT 거부');
select throws_ok($$update public.draws_lotto set bonus = 43 where draw_no = 900001$$, '42501', null, 'anon draws_lotto UPDATE 거부');
select throws_ok($$delete from public.draws_lotto$$, '42501', null, 'anon draws_lotto DELETE 거부');
select throws_ok($$truncate public.draws_lotto cascade$$, '42501', null, 'anon draws_lotto TRUNCATE 거부');
select throws_ok($$insert into public.draws_pension (draw_no, draw_date, group_no, digits, bonus_digits, prizes, source_url, ingestion_run_id, source_verified_at)
  values (900009, '2099-09-09', 1, '123456', '123456', '[]', 'x', '00000000-0000-4000-8000-0000000000aa', now())$$,
  '42501', null, 'anon draws_pension INSERT 거부');
select throws_ok($$update public.draws_pension set group_no = 2 where draw_no = 900001$$, '42501', null, 'anon draws_pension UPDATE 거부');
select throws_ok($$delete from public.draws_pension$$, '42501', null, 'anon draws_pension DELETE 거부');
select throws_ok($$truncate public.draws_pension cascade$$, '42501', null, 'anon draws_pension TRUNCATE 거부');
select throws_ok($$insert into public.statistics_cache (game, window_key, metric, payload, range_from, range_to, sample_size, source, updated_at)
  values ('lotto', 'a', 'b', '{}', 1, 2, 2, 'x', now())$$, '42501', null, 'anon statistics_cache INSERT 거부');
select throws_ok($$update public.statistics_cache set sample_size = 1$$, '42501', null, 'anon statistics_cache UPDATE 거부');
select throws_ok($$delete from public.statistics_cache$$, '42501', null, 'anon statistics_cache DELETE 거부');
select throws_ok($$truncate public.statistics_cache$$, '42501', null, 'anon statistics_cache TRUNCATE 거부');
select is((select count(*) from public.draws_lotto where draw_no = 900001), 1::bigint, 'anon draws_lotto SELECT 성공');
select is((select count(*) from public.draws_pension where draw_no = 900001 and digits = '000719'), 1::bigint,
  'anon draws_pension SELECT 성공(문자열 000719)');
select is((select count(*) from public.statistics_cache where window_key = 't-window'), 1::bigint, 'anon statistics_cache SELECT 성공');
select throws_ok($$select * from public.ingestion_runs$$, '42501', null, 'anon ingestion_runs SELECT 거부');
select throws_ok($$insert into public.ingestion_runs (game, draw_no, source_url, fetched_at, payload_sha256, raw_payload, status)
  values ('lotto', 1, 'x', now(), 'y', '{}', 'verified')$$, '42501', null, 'anon ingestion_runs INSERT 거부');
reset role;

-- authenticated: 쓰기 전부 거부, SELECT 허용 -------------------------------------
set local role authenticated;
select throws_ok($$insert into public.draws_lotto (draw_no, draw_date, nums, bonus, prizes, source_url, ingestion_run_id, source_verified_at)
  values (900009, '2099-09-09', '{1,2,3,4,5,6}', 7, '[]', 'x', '00000000-0000-4000-8000-0000000000aa', now())$$,
  '42501', null, 'authenticated draws_lotto INSERT 거부');
select throws_ok($$update public.draws_lotto set bonus = 43 where draw_no = 900001$$, '42501', null, 'authenticated draws_lotto UPDATE 거부');
select throws_ok($$delete from public.draws_lotto$$, '42501', null, 'authenticated draws_lotto DELETE 거부');
select throws_ok($$truncate public.draws_lotto cascade$$, '42501', null, 'authenticated draws_lotto TRUNCATE 거부');
select throws_ok($$insert into public.draws_pension (draw_no, draw_date, group_no, digits, bonus_digits, prizes, source_url, ingestion_run_id, source_verified_at)
  values (900009, '2099-09-09', 1, '123456', '123456', '[]', 'x', '00000000-0000-4000-8000-0000000000aa', now())$$,
  '42501', null, 'authenticated draws_pension INSERT 거부');
select throws_ok($$update public.draws_pension set group_no = 2 where draw_no = 900001$$, '42501', null, 'authenticated draws_pension UPDATE 거부');
select throws_ok($$delete from public.draws_pension$$, '42501', null, 'authenticated draws_pension DELETE 거부');
select throws_ok($$truncate public.draws_pension cascade$$, '42501', null, 'authenticated draws_pension TRUNCATE 거부');
select throws_ok($$insert into public.statistics_cache (game, window_key, metric, payload, range_from, range_to, sample_size, source, updated_at)
  values ('lotto', 'a', 'b', '{}', 1, 2, 2, 'x', now())$$, '42501', null, 'authenticated statistics_cache INSERT 거부');
select throws_ok($$update public.statistics_cache set sample_size = 1$$, '42501', null, 'authenticated statistics_cache UPDATE 거부');
select throws_ok($$delete from public.statistics_cache$$, '42501', null, 'authenticated statistics_cache DELETE 거부');
select throws_ok($$truncate public.statistics_cache$$, '42501', null, 'authenticated statistics_cache TRUNCATE 거부');
select is((select count(*) from public.draws_lotto where draw_no = 900001), 1::bigint, 'authenticated draws_lotto SELECT 성공');
select is((select count(*) from public.draws_pension where draw_no = 900001), 1::bigint, 'authenticated draws_pension SELECT 성공');
select is((select count(*) from public.statistics_cache where window_key = 't-window'), 1::bigint, 'authenticated statistics_cache SELECT 성공');
select throws_ok($$select * from public.ingestion_runs$$, '42501', null, 'authenticated ingestion_runs SELECT 거부');
select throws_ok($$insert into public.ingestion_runs (game, draw_no, source_url, fetched_at, payload_sha256, raw_payload, status)
  values ('lotto', 1, 'x', now(), 'y', '{}', 'verified')$$, '42501', null, 'authenticated ingestion_runs INSERT 거부');
reset role;

-- CHECK 제약 (service_role) ------------------------------------------------------
-- 로또 nums·bonus·prizes: %s = nums 리터럴, 두 번째 = bonus, 세 번째 = prizes
create temp table t_lotto_case (label text, nums_sql text, bonus int, prizes text) on commit drop;
insert into t_lotto_case values
  ('nums 중복 거부',          $q$'{1,1,2,3,4,5}'$q$,          10, '[]'),
  ('nums 비오름차순 거부',     $q$'{2,1,3,4,5,6}'$q$,          10, '[]'),
  ('nums 범위 밖(0) 거부',     $q$'{0,1,2,3,4,5}'$q$,          10, '[]'),
  ('nums 범위 밖(46) 거부',    $q$'{1,2,3,4,5,46}'$q$,         10, '[]'),
  ('nums NULL 요소 거부',      $q$'{1,2,3,4,5,NULL}'$q$,       10, '[]'),
  ('nums 하한 [0:5] 거부',     $q$'[0:5]={1,2,3,4,5,6}'$q$,    10, '[]'),
  ('nums 길이 5 거부',         $q$'{1,2,3,4,5}'$q$,            10, '[]'),
  ('nums 길이 7 거부',         $q$'{1,2,3,4,5,6,7}'$q$,        10, '[]'),
  ('nums 다차원 거부',         $q$'{{1,2,3},{4,5,6}}'$q$,      10, '[]'),
  ('nums 빈 배열 거부',        $q$'{}'$q$,                     10, '[]'),
  ('bonus ∈ nums 거부',        $q$'{1,2,3,4,5,6}'$q$,          6,  '[]'),
  ('bonus 범위 밖(46) 거부',   $q$'{1,2,3,4,5,6}'$q$,          46, '[]'),
  ('lotto prizes 비배열 거부', $q$'{1,2,3,4,5,6}'$q$,          10, '{"rank":1}');
grant select on t_lotto_case to service_role;
set local role service_role;

select throws_ok(
  format($f$insert into public.draws_lotto
    (draw_no, draw_date, nums, bonus, prizes, source_url, ingestion_run_id, source_verified_at)
    values (900002, '2099-02-07', %s, %s, %L, 'x', '00000000-0000-4000-8000-0000000000aa', now())$f$,
    nums_sql, bonus, prizes),
  '23514', null, label)
from t_lotto_case order by label;

select throws_ok($$insert into public.draws_lotto
  (draw_no, draw_date, nums, bonus, prizes, source_url, ingestion_run_id, source_verified_at)
  values (900002, '2099-02-07', null, 10, '[]', 'x', '00000000-0000-4000-8000-0000000000aa', now())$$,
  '23502', null, 'nums NULL 거부(NOT NULL)');
select throws_ok($$insert into public.draws_pension
  (draw_no, draw_date, group_no, digits, bonus_digits, prizes, source_url, ingestion_run_id, source_verified_at)
  values (900002, '2099-02-05', 1, '719', '123456', '[]', 'x', '00000000-0000-4000-8000-0000000000aa', now())$$,
  '23514', null, 'digits ''719'' 거부');
select throws_ok($$insert into public.draws_pension
  (draw_no, draw_date, group_no, digits, bonus_digits, prizes, source_url, ingestion_run_id, source_verified_at)
  values (900002, '2099-02-05', 1, '123456', '719', '[]', 'x', '00000000-0000-4000-8000-0000000000aa', now())$$,
  '23514', null, 'bonus_digits ''719'' 거부');
select throws_ok($$insert into public.draws_pension
  (draw_no, draw_date, group_no, digits, bonus_digits, prizes, source_url, ingestion_run_id, source_verified_at)
  values (900002, '2099-02-05', 1, '12a456', '123456', '[]', 'x', '00000000-0000-4000-8000-0000000000aa', now())$$,
  '23514', null, 'digits 숫자 아닌 문자 거부');
select throws_ok($$insert into public.draws_pension
  (draw_no, draw_date, group_no, digits, bonus_digits, prizes, source_url, ingestion_run_id, source_verified_at)
  values (900002, '2099-02-05', 6, '123456', '123456', '[]', 'x', '00000000-0000-4000-8000-0000000000aa', now())$$,
  '23514', null, 'group_no 6 거부');
select throws_ok($$insert into public.draws_pension
  (draw_no, draw_date, group_no, digits, bonus_digits, prizes, source_url, ingestion_run_id, source_verified_at)
  values (900002, '2099-02-05', 1, '123456', '123456', '"x"', 'x', '00000000-0000-4000-8000-0000000000aa', now())$$,
  '23514', null, 'pension prizes 비배열 거부');
select throws_ok($$insert into public.statistics_cache
  (game, window_key, metric, payload, range_from, range_to, sample_size, source, updated_at)
  values ('lotto', 'w2', 'm2', '{}', 11, 10, 0, 'x', now())$$, '23514', null, 'statistics_cache range_from > range_to 거부');
select throws_ok($$insert into public.statistics_cache
  (game, window_key, metric, payload, range_from, range_to, sample_size, source, updated_at)
  values ('lotto', 'w3', 'm3', '{}', 1, 10, -1, 'x', now())$$, '23514', null, 'statistics_cache sample_size < 0 거부');
select throws_ok($$insert into public.ingestion_runs
  (game, draw_no, source_url, fetched_at, payload_sha256, raw_payload, status)
  values ('lotto', 900003, 'x', now(), 'z', '{}', 'bogus')$$, '23514', null, 'ingestion_runs status 허용 값 밖 거부');

-- 수집 이력은 service_role도 삭제 불가(권한)
select throws_ok($$delete from public.ingestion_runs where id = '00000000-0000-4000-8000-0000000000aa'$$,
  '42501', null, 'service_role ingestion_runs DELETE 거부');
select throws_ok($$truncate public.ingestion_runs cascade$$, '42501', null, 'service_role ingestion_runs TRUNCATE 거부');
reset role;

-- 참조된 수집 이력 삭제 = RESTRICT (소유자 권한으로 확인, Postgres는 FK RESTRICT 위반도 23503으로 보고)
select throws_ok($$delete from public.ingestion_runs where id = '00000000-0000-4000-8000-0000000000aa'$$,
  '23503', null, '참조된 ingestion_runs 삭제 거부(FK)');
select is(
  (select array_agg(confdeltype::text order by conrelid::regclass::text) from pg_constraint
    where contype = 'f' and confrelid = 'public.ingestion_runs'::regclass),
  array['r', 'r'], 'draws_*.ingestion_run_id FK = ON DELETE RESTRICT');

-- 카탈로그 권한: 역할 × 테이블 × 권한 기대값 (84건) ---------------------------------
select is(has_table_privilege(r.role, 'public.' || t.tbl, p.priv),
          coalesce(e.expected, false),
          format('%s %s %s = %s', r.role, t.tbl, p.priv, coalesce(e.expected, false)))
from (values ('anon'), ('authenticated'), ('service_role')) r(role)
cross join (values ('draws_lotto'), ('draws_pension'), ('statistics_cache'), ('ingestion_runs')) t(tbl)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
left join (values
  ('anon',          'draws_lotto',      'SELECT', true),
  ('anon',          'draws_pension',    'SELECT', true),
  ('anon',          'statistics_cache', 'SELECT', true),
  ('authenticated', 'draws_lotto',      'SELECT', true),
  ('authenticated', 'draws_pension',    'SELECT', true),
  ('authenticated', 'statistics_cache', 'SELECT', true),
  ('service_role',  'draws_lotto',      'SELECT', true),
  ('service_role',  'draws_lotto',      'INSERT', true),
  ('service_role',  'draws_lotto',      'UPDATE', true),
  ('service_role',  'draws_pension',    'SELECT', true),
  ('service_role',  'draws_pension',    'INSERT', true),
  ('service_role',  'draws_pension',    'UPDATE', true),
  ('service_role',  'statistics_cache', 'SELECT', true),
  ('service_role',  'statistics_cache', 'INSERT', true),
  ('service_role',  'statistics_cache', 'UPDATE', true),
  ('service_role',  'statistics_cache', 'DELETE', true),
  ('service_role',  'ingestion_runs',   'SELECT', true),
  ('service_role',  'ingestion_runs',   'INSERT', true)
) e(role, tbl, priv, expected) on e.role = r.role and e.tbl = t.tbl and e.priv = p.priv
order by r.role, t.tbl, p.priv;

-- ingestion_runs service_role UPDATE는 검토 열만 (5건 카탈로그 + 2건 실제)
select ok(has_column_privilege('service_role', 'public.ingestion_runs', 'status', 'UPDATE'), 'service_role status UPDATE 허용');
select ok(has_column_privilege('service_role', 'public.ingestion_runs', 'review_note', 'UPDATE'), 'service_role review_note UPDATE 허용');
select ok(not has_column_privilege('service_role', 'public.ingestion_runs', 'raw_payload', 'UPDATE'), 'service_role raw_payload UPDATE 없음');
select ok(not has_column_privilege('service_role', 'public.ingestion_runs', 'payload_sha256', 'UPDATE'), 'service_role payload_sha256 UPDATE 없음');
select ok(not has_column_privilege('service_role', 'public.ingestion_runs', 'source_url', 'UPDATE'), 'service_role source_url UPDATE 없음');
set local role service_role;
select lives_ok($$update public.ingestion_runs set status = 'approved', review_note = 't'
  where id = '00000000-0000-4000-8000-0000000000aa'$$, 'service_role 검토 열 UPDATE 성공');
select throws_ok($$update public.ingestion_runs set raw_payload = '{}'
  where id = '00000000-0000-4000-8000-0000000000aa'$$, '42501', null, 'service_role raw_payload UPDATE 거부');
reset role;

select * from finish();
rollback;
