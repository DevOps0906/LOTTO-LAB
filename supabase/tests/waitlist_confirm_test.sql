-- task-003b 이중 확인: waitlist_request_confirm · waitlist_confirm · waitlist_purge_unconfirmed 회귀 테스트
-- 한 트랜잭션 안이라 now()가 고정이다 → 시간 경과는 행의 시각 컬럼을 직접 옮겨 흉내 낸다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

-- 권한: anon·authenticated는 두 RPC 모두 42501 -----------------------------------
set local role anon;
select throws_ok($$select public.waitlist_request_confirm('a@example.com', repeat('a', 64), 86400, 3, 86400)$$,
                 '42501', null, 'anon request_confirm 거부');
select throws_ok($$select public.waitlist_confirm(repeat('a', 64))$$, '42501', null, 'anon confirm 거부');
reset role;
set local role authenticated;
select throws_ok($$select public.waitlist_request_confirm('a@example.com', repeat('a', 64), 86400, 3, 86400)$$,
                 '42501', null, 'authenticated request_confirm 거부');
select throws_ok($$select public.waitlist_confirm(repeat('a', 64))$$, '42501', null, 'authenticated confirm 거부');
reset role;

set local role service_role;

-- 인자 검증 ---------------------------------------------------------------------
select throws_ok($$select public.waitlist_request_confirm('a@example.com', 'not-hex', 86400, 3, 86400)$$,
                 '22023', null, '해시 형식 오류 거부');
select is(public.waitlist_confirm('not-hex'), false, 'confirm: 해시 형식 오류는 false');

-- 신규 신청: 행 생성 + 토큰 해시·만료·발송 1 -------------------------------------------
select is(public.waitlist_request_confirm('Cap@Example.com', repeat('1', 64), 86400, 3, 86400), true, '신규 → 발송');
select is(
  (select row(confirmed_at is null, confirm_token_hash, confirm_expires_at = now() + interval '24 hours', confirm_sends)::text
     from public.waitlist_signups where email_norm = 'cap@example.com'),
  row(true, repeat('1', 64), true, 1)::text,
  '신규 행: 미확인 · 해시 저장 · 24시간 만료 · 발송 1'
);

-- 미만료 링크가 있으면 새 토큰 없음(해시·만료·카운트 불변) ---------------------------------
select is(public.waitlist_request_confirm(' cap@example.COM ', repeat('2', 64), 86400, 3, 86400), false, '미만료 중 재신청 → false');
select is(
  (select row(confirm_token_hash, confirm_expires_at = now() + interval '24 hours', confirm_sends)::text
     from public.waitlist_signups where email_norm = 'cap@example.com'),
  row(repeat('1', 64), true, 1)::text,
  '미만료 중 재신청: 해시·만료·카운트 불변'
);

-- 만료 후에만 새 토큰, 창 안 3통 한도 ---------------------------------------------------
update public.waitlist_signups set confirm_expires_at = now() where email_norm = 'cap@example.com';
select is(public.waitlist_request_confirm('cap@example.com', repeat('2', 64), 86400, 3, 86400), true, '만료 후 → 새 토큰 발송(2통)');
select is(
  (select row(confirm_token_hash, confirm_sends)::text from public.waitlist_signups where email_norm = 'cap@example.com'),
  row(repeat('2', 64), 2)::text,
  '만료 후 재발급: 새 해시 · 발송 2'
);
update public.waitlist_signups set confirm_expires_at = now() where email_norm = 'cap@example.com';
select is(public.waitlist_request_confirm('cap@example.com', repeat('3', 64), 86400, 3, 86400), true, '3통째 발송');
update public.waitlist_signups set confirm_expires_at = now() where email_norm = 'cap@example.com';
select is(public.waitlist_request_confirm('cap@example.com', repeat('4', 64), 86400, 3, 86400), false, '만료됐어도 창 안 4통째 → false');
select is(
  (select row(confirm_token_hash, confirm_sends)::text from public.waitlist_signups where email_norm = 'cap@example.com'),
  row(repeat('3', 64), 3)::text,
  '한도 초과 시 마지막 해시·카운트 유지'
);

-- 창 경계: window_start + window_sec 직전은 한도 유지, 그 시점부터 새 창 ----------------------
update public.waitlist_signups set confirm_window_start = now() - interval '86399 seconds'
 where email_norm = 'cap@example.com';
select is(public.waitlist_request_confirm('cap@example.com', repeat('4', 64), 86400, 3, 86400), false, '창 종료 1초 전 → false');
update public.waitlist_signups set confirm_window_start = now() - interval '86400 seconds'
 where email_norm = 'cap@example.com';
select is(public.waitlist_request_confirm('cap@example.com', repeat('4', 64), 86400, 3, 86400), true, '창 종료 시점 정확히 → 새 창 발송');
select is(
  (select row(confirm_sends, confirm_window_start = now(), confirm_token_hash)::text
     from public.waitlist_signups where email_norm = 'cap@example.com'),
  row(1, true, repeat('4', 64))::text,
  '창 리셋: 발송 1 · 창 시작 = 지금 · 새 해시'
);

-- 확인: 이전 토큰 false, 현재 토큰 true, 재제출 true ----------------------------------------
select is(public.waitlist_confirm(repeat('3', 64)), false, '덮어쓴 이전 토큰 false');
select is(public.waitlist_confirm(repeat('4', 64)), true, '현재 토큰 → 확정');
select is(
  (select row(confirmed_at = now(), consented_at = now())::text from public.waitlist_signups where email_norm = 'cap@example.com'),
  row(true, true)::text,
  '확정: confirmed_at·consented_at = 확인 시각'
);
select is(public.waitlist_confirm(repeat('4', 64)), true, '같은 토큰 재제출 true');

-- 확인된 행 재신청(링크 만료 후라도): false, 동의·확인 시각·토큰 불변 ----------------------------
update public.waitlist_signups
   set consented_at = '2026-01-01 00:00:00+00', confirmed_at = '2026-01-01 00:00:00+00',
       confirm_expires_at = now() - interval '1 second', confirm_window_start = now() - interval '2 days'
 where email_norm = 'cap@example.com';
select is(public.waitlist_request_confirm('cap@example.com', repeat('6', 64), 86400, 3, 86400), false, '확인된 행 재신청 → false');
select is(
  (select row(consented_at, confirmed_at, confirm_token_hash)::text from public.waitlist_signups where email_norm = 'cap@example.com'),
  row('2026-01-01 00:00:00+00'::timestamptz, '2026-01-01 00:00:00+00'::timestamptz, repeat('4', 64))::text,
  '확인된 행: consented_at·confirmed_at·토큰 해시 불변'
);

-- 만료 토큰 false ------------------------------------------------------------------
select public.waitlist_request_confirm('exp@example.com', repeat('7', 64), 86400, 3, 86400);
update public.waitlist_signups set confirm_expires_at = now() - interval '1 second' where email_norm = 'exp@example.com';
select is(public.waitlist_confirm(repeat('7', 64)), false, '만료 토큰 false');
select ok((select confirmed_at is null from public.waitlist_signups where email_norm = 'exp@example.com'), '만료 토큰은 확정 안 함');
reset role;

-- pg_cron: 미확인 만료 행만 삭제 --------------------------------------------------------
select ok(exists(select 1 from cron.job where jobname = 'waitlist_purge_unconfirmed'), 'cron waitlist_purge_unconfirmed 존재');
insert into public.waitlist_signups (email, consent_marketing, age_confirmed, confirm_expires_at, confirmed_at)
values ('p-live@example.com', true, true, now() + interval '1 hour', null),
       ('p-conf@example.com', true, true, now() - interval '1 hour', now() - interval '2 hours');
do $$ begin execute (select command from cron.job where jobname = 'waitlist_purge_unconfirmed'); end $$;
select is(
  (select array_agg(email_norm order by email_norm) from public.waitlist_signups
    where email_norm in ('exp@example.com', 'p-live@example.com', 'p-conf@example.com', 'cap@example.com')),
  array['cap@example.com', 'p-conf@example.com', 'p-live@example.com'],
  'purge: 미확인·만료 행만 삭제(확인된 행·미만료 행 유지)'
);

select * from finish();
rollback;
