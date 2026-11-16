-- 옛 public 스키마 합성 데이터(실데이터 아님). 사용자 A·B 2명, 익명 0명. 표마다 2~3행.
-- 포함: updated_at null(옛 스키마 허용) · 멱등 키 · 구매 금액(원) · 생성 번호 출처 · 판정 이력 · 이메일 확인/미확인.
-- LOTTO-LAB 옛 스키마에는 소프트 삭제·공유 링크·유료 플랜 열이 없다(새 deleted_at은 null로 시작).
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'user-a@example.test'),
  ('b0000000-0000-4000-8000-00000000000b', 'user-b@example.test');

insert into public.waitlist_signups (id, email, consent_marketing, age_confirmed, consented_at, created_at,
  confirmed_at, confirm_token_hash, confirm_expires_at, confirm_sends, confirm_window_start) values
  ('c1000000-0000-4000-8000-000000000001', 'Wait-One@Example.test', true, true, '2026-10-01 10:00+09', '2026-10-01 09:59+09',
   '2026-10-01 10:00+09', repeat('a', 64), '2026-10-02 09:59+09', 1, '2026-10-01 09:59+09'),
  ('c1000000-0000-4000-8000-000000000002', 'wait-two@example.test', true, true, '2026-11-10 08:00+09', '2026-11-10 08:00+09',
   null, repeat('b', 64), '2026-11-11 08:00+09', 2, '2026-11-10 08:00+09');

insert into private.rate_limits (key, window_start, hits) values
  (repeat('1', 64), '2026-11-16 10:00+09', 3),
  (repeat('2', 64), '2026-11-16 10:01+09', 1);

insert into public.ingestion_runs (id, game, draw_no, source_url, fetched_at, payload_sha256, raw_payload, status,
  validation_errors, reverified_at, reverify_errors, reviewed_by, reviewed_at, review_note, created_at) values
  ('d1000000-0000-4000-8000-000000000001', 'lotto', 1100, 'https://example.test/lotto/1100', '2026-11-08 21:00+09',
   repeat('c', 64), '{"drwNo":1100}', 'verified', null, '2026-11-08 22:00+09', null, null, null, null, '2026-11-08 21:00+09'),
  ('d1000000-0000-4000-8000-000000000002', 'pension', 290, 'https://example.test/pension/290', '2026-11-06 20:00+09',
   repeat('d', 64), '{"round":290}', 'approved', '[]', null, null,
   'a0000000-0000-4000-8000-00000000000a', '2026-11-06 21:00+09', '수동 승인', '2026-11-06 20:00+09'),
  ('d1000000-0000-4000-8000-000000000003', 'lotto', 1100, 'https://example.test/lotto/1100', '2026-11-08 20:50+09',
   repeat('e', 64), '{"drwNo":1100,"bad":true}', 'rejected', '["nums"]', null, null,
   'a0000000-0000-4000-8000-00000000000a', '2026-11-08 21:05+09', '형식 오류', '2026-11-08 20:50+09');

insert into public.draws_lotto (draw_no, draw_date, nums, bonus, prizes, source_url, ingestion_run_id, source_verified_at, created_at) values
  (1100, '2026-11-07', '{3,11,19,27,35,44}', 7, '[{"rank":1,"amount":2000000000}]', 'https://example.test/lotto/1100',
   'd1000000-0000-4000-8000-000000000001', '2026-11-08 22:00+09', '2026-11-08 21:00+09'),
  (1099, '2026-10-31', '{1,2,3,4,5,6}', 45, '[]', 'https://example.test/lotto/1099',
   'd1000000-0000-4000-8000-000000000001', '2026-11-01 22:00+09', '2026-11-01 21:00+09');

insert into public.draws_pension (draw_no, draw_date, group_no, digits, bonus_digits, prizes, source_url, ingestion_run_id, source_verified_at, created_at) values
  (290, '2026-11-05', 3, '000719', '123456', '[]', 'https://example.test/pension/290',
   'd1000000-0000-4000-8000-000000000002', '2026-11-06 21:00+09', '2026-11-06 20:00+09'),
  (289, '2026-10-29', 1, '987650', '012345', '[{"rank":1}]', 'https://example.test/pension/289',
   'd1000000-0000-4000-8000-000000000002', '2026-10-30 21:00+09', '2026-10-30 20:00+09');

insert into public.statistics_cache (game, window_key, metric, payload, range_from, range_to, sample_size, source, updated_at, created_at) values
  ('lotto', 'all', 'frequency', '{"1":10}', 1, 1100, 1100, 'draws_lotto', '2026-11-08 23:00+09', '2026-01-01 00:00+09'),
  ('pension', '52w', 'digit_frequency', '{"0":3}', 239, 290, 52, 'draws_pension', '2026-11-06 23:00+09', '2026-01-01 00:00+09');

insert into public.generator_profiles (id, user_id, game, name, config, updated_at, created_at) values
  ('e1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'lotto', 'A 기본', '{"exclude":[1,2]}', null, '2026-09-01 10:00+09'),
  ('e1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'pension', 'A 연금', '{}', '2026-10-01 10:00+09', '2026-09-02 10:00+09'),
  ('e1000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-00000000000b', 'lotto', 'B 홀짝', '{"odd":3}', '2026-10-05 10:00+09', '2026-09-03 10:00+09');

insert into public.generated_batches (id, user_id, game, round, strategy, method, engine_version, created_at) values
  ('f1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'lotto', 1100, 'balanced', 'random', 'v1', '2026-11-01 10:00+09'),
  ('f1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'pension', 290, 'plain', 'saju', 'v1', '2026-11-02 10:00+09'),
  ('f1000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-00000000000b', 'lotto', 1100, 'hot', 'condition', 'v1', '2026-11-03 10:00+09');

insert into public.generated_numbers (id, batch_id, game, line_no, numbers, group_no, created_at) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'lotto', 1, '{"nums":[3,11,19,27,35,44]}', null, '2026-11-01 10:00+09'),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'lotto', 2, '{"nums":[1,9,17,25,33,41]}', null, '2026-11-01 10:00+09'),
  ('f2000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000002', 'pension', 1, '{"digits":"000719"}', 3, '2026-11-02 10:00+09'),
  ('f2000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000003', 'lotto', 1, '{"nums":[5,10,15,20,25,30]}', null, '2026-11-03 10:00+09');

insert into public.saved_tickets (id, user_id, game, round, ticket_data, purchase_status, purchase_date, amount_won,
  source_number_id, idempotency_key, created_at) values
  ('f3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'lotto', 1100, '{"nums":[3,11,19,27,35,44]}',
   'purchased', '2026-11-05', 5000, 'f2000000-0000-4000-8000-000000000001', '9a000000-0000-4000-8000-000000000001', '2026-11-05 12:00+09'),
  ('f3000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'pension', 290, '{"group_no":3,"digits":"000719"}',
   'favorite', null, null, null, '9a000000-0000-4000-8000-000000000002', '2026-11-04 12:00+09'),
  ('f3000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-00000000000b', 'lotto', 1100, '{"nums":[5,10,15,20,25,30]}',
   'purchased', '2026-11-06', 1000, 'f2000000-0000-4000-8000-000000000004', '9a000000-0000-4000-8000-000000000001', '2026-11-06 12:00+09');

insert into public.draw_checks (id, ticket_id, game, draw_no, matched_rank, bonus_hit, checked_at, created_at) values
  ('f4000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'lotto', 1100, 1, false, '2026-11-08 22:10+09', '2026-11-08 22:10+09'),
  ('f4000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000001', 'lotto', 1100, 1, false, '2026-11-09 22:10+09', '2026-11-09 22:10+09'),
  ('f4000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000003', 'lotto', 1100, null, false, '2026-11-08 22:10+09', '2026-11-08 22:10+09');

insert into public.fortune_profiles (user_id, birth_date, calendar, is_leap_month, birth_hour, consented_at, updated_at) values
  ('a0000000-0000-4000-8000-00000000000a', '1990-04-30', 'lunar', true, null, '2026-10-10 10:00+09', null),
  ('b0000000-0000-4000-8000-00000000000b', '1985-12-31', 'solar', false, 'o', '2026-10-11 10:00+09', '2026-10-20 10:00+09');

insert into public.user_consents (id, user_id, terms_version, privacy_version, adult_confirmed, consented_at) values
  ('f5000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', '2026-09', '2026-09', true, '2026-09-01 09:00+09'),
  ('f5000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', '2026-11', '2026-11', true, '2026-11-01 09:00+09'),
  ('f5000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-00000000000b', '2026-09', '2026-09', true, '2026-09-03 09:00+09');

commit;
