-- task-003 waitlist_signups · waitlist_rate_hit · pg_cron 회귀 테스트
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- anon: 모든 직접 접근 거부 ------------------------------------------------
set local role anon;
select throws_ok($$select * from public.waitlist_signups$$, '42501', null, 'anon SELECT 거부');
select throws_ok($$insert into public.waitlist_signups (email, consent_marketing, age_confirmed)
                   values ('a@example.com', true, true)$$, '42501', null, 'anon INSERT 거부');
select throws_ok($$update public.waitlist_signups set consented_at = now()$$, '42501', null, 'anon UPDATE 거부');
select throws_ok($$delete from public.waitlist_signups$$, '42501', null, 'anon DELETE 거부');
select throws_ok($$select public.waitlist_rate_hit('anon-key', 600, 5)$$, '42501', null, 'anon rate_hit 실행 거부');
reset role;

-- authenticated: 모든 직접 접근 거부 ---------------------------------------
set local role authenticated;
select throws_ok($$select * from public.waitlist_signups$$, '42501', null, 'authenticated SELECT 거부');
select throws_ok($$insert into public.waitlist_signups (email, consent_marketing, age_confirmed)
                   values ('b@example.com', true, true)$$, '42501', null, 'authenticated INSERT 거부');
select throws_ok($$update public.waitlist_signups set consented_at = now()$$, '42501', null, 'authenticated UPDATE 거부');
select throws_ok($$delete from public.waitlist_signups$$, '42501', null, 'authenticated DELETE 거부');
select throws_ok($$select public.waitlist_rate_hit('auth-key', 600, 5)$$, '42501', null, 'authenticated rate_hit 실행 거부');
reset role;

-- service_role: CHECK·UNIQUE --------------------------------------------
set local role service_role;
select throws_ok($$insert into public.waitlist_signups (email, consent_marketing, age_confirmed)
                   values ('c@example.com', false, true)$$, '23514', null, '마케팅 동의 false 거부');
select throws_ok($$insert into public.waitlist_signups (email, consent_marketing, age_confirmed)
                   values ('d@example.com', true, false)$$, '23514', null, '연령 확인 false 거부');
select throws_ok(format($$insert into public.waitlist_signups (email, consent_marketing, age_confirmed)
                   values (%L, true, true)$$, repeat('a', 243) || '@example.com'),
                 '23514', null, '255자 이메일 거부');
select lives_ok($$insert into public.waitlist_signups (email, consent_marketing, age_confirmed)
                  values ('Dup@Example.com', true, true)$$, '신규 INSERT 성공');
select throws_ok($$insert into public.waitlist_signups (email, consent_marketing, age_confirmed)
                   values ('  dup@example.COM ', true, true)$$, '23505', null, '대소문자·공백만 다른 이메일 UNIQUE 충돌');
select lives_ok($$insert into public.waitlist_signups (email, consent_marketing, age_confirmed)
                  values ('dup@example.com', true, true)
                  on conflict (email_norm) do update set consented_at = now()$$, 'ON CONFLICT(email_norm) 재신청 허용');

-- rate_hit: 한도 5 → 6번째 false (테스트 고유 key)
select is(
  (select array_agg(public.waitlist_rate_hit('t-' || pg_backend_pid() || '-' || txid_current(), 600, 5)
                    order by g)
     from generate_series(1, 6) g),
  array[true, true, true, true, true, false],
  'rate_hit 6번째 호출은 false'
);
select is(public.waitlist_rate_hit('t-other-' || txid_current(), 600, 5), true, '다른 key는 별도 카운트');
reset role;

-- pg_cron 작업 --------------------------------------------------------------
select ok(exists(select 1 from cron.job where jobname = 'waitlist_purge_6m'), 'cron waitlist_purge_6m 존재');
select ok(exists(select 1 from cron.job where jobname = 'rate_limits_purge'), 'cron rate_limits_purge 존재');

-- 보관 기간 삭제: 등록된 작업 명령 그대로 실행
insert into public.waitlist_signups (email, consent_marketing, age_confirmed, created_at)
values ('old@example.com', true, true, now() - interval '7 months'),
       ('new@example.com', true, true, now() - interval '5 months');
do $$ begin execute (select command from cron.job where jobname = 'waitlist_purge_6m'); end $$;
select is(
  (select array_agg(email order by email) from public.waitlist_signups
    where email in ('old@example.com', 'new@example.com')),
  array['new@example.com'],
  'waitlist_purge_6m: 6개월 지난 행만 삭제'
);

insert into private.rate_limits (key, window_start, hits)
values ('purge-old', now() - interval '2 days', 3), ('purge-new', now() - interval '1 hour', 3);
do $$ begin execute (select command from cron.job where jobname = 'rate_limits_purge'); end $$;
select is(
  (select array_agg(key order by key) from private.rate_limits where key like 'purge-%'),
  array['purge-new'],
  'rate_limits_purge: 1일 지난 창만 삭제'
);

select * from finish();
rollback;
