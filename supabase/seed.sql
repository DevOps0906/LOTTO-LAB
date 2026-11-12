-- 로컬 시드 (db reset 때만 실행). 모두 합성 데이터 — 실제 회차 아님.
-- 회차 번호·날짜·번호·당첨금은 화면 확인용으로 지어낸 값이며, 출처 표식은 https://synthetic.invalid/…
-- 원격 프로젝트에 `db reset --linked`·`db push --include-seed` 금지(docs/05_DATA_MODEL.md#1, supabase/README.md#시드).

-- 합성 수집 이력: 회차마다 1행(game·draw_no 일치) -----------------------------------
insert into public.ingestion_runs
  (id, game, draw_no, source_url, fetched_at, payload_sha256, raw_payload, status)
select id::uuid, game::public.game_type, draw_no,
       'https://synthetic.invalid/' || game || '/' || draw_no, now(),
       encode(sha256(convert_to(payload, 'UTF8')), 'hex'), payload::jsonb, 'verified'
from (values
  ('00000000-0000-4000-8000-000000000101', 'lotto',   1),
  ('00000000-0000-4000-8000-000000000102', 'lotto',   2),
  ('00000000-0000-4000-8000-000000000103', 'lotto',   3),
  ('00000000-0000-4000-8000-000000000201', 'pension', 1),
  ('00000000-0000-4000-8000-000000000202', 'pension', 2)
) as v(id, game, draw_no)
cross join lateral (
  select format('{"synthetic":true,"game":"%s","draw_no":%s}', game, draw_no) as payload
) p;

-- 합성 로또 회차 (실제 회차 아님) ------------------------------------------------
insert into public.draws_lotto
  (draw_no, draw_date, nums, bonus, prizes, source_url, ingestion_run_id, source_verified_at)
values
  (1, '2026-01-03', '{3,11,19,27,35,43}', 7,
   '[{"rank":1,"bonus":false,"amount_won":2000000000,"winners":1,"payout":"lump"},
     {"rank":5,"bonus":false,"amount_won":5000,"winners":250000,"payout":"lump"}]',
   'https://synthetic.invalid/lotto/1', '00000000-0000-4000-8000-000000000101', now()),
  (2, '2026-01-10', '{1,2,10,20,30,45}', 44,
   '[{"rank":1,"bonus":false,"amount_won":1500000000,"winners":2,"payout":"lump"}]',
   'https://synthetic.invalid/lotto/2', '00000000-0000-4000-8000-000000000102', now()),
  (3, '2026-01-17', '{5,6,14,22,38,41}', 9,
   '[{"rank":1,"bonus":false,"amount_won":3000000000,"winners":1,"payout":"lump"}]',
   'https://synthetic.invalid/lotto/3', '00000000-0000-4000-8000-000000000103', now());

-- 합성 연금 회차 (실제 회차 아님, 앞자리 0 보존 확인용) --------------------------
insert into public.draws_pension
  (draw_no, draw_date, group_no, digits, bonus_digits, prizes, source_url, ingestion_run_id, source_verified_at)
values
  (1, '2026-01-08', 1, '000719', '052381',
   '[{"rank":1,"bonus":false,"amount_won":7000000,"winners":1,"payout":"annuity","months":240}]',
   'https://synthetic.invalid/pension/1', '00000000-0000-4000-8000-000000000201', now()),
  (2, '2026-01-15', 4, '381204', '009917',
   '[{"rank":1,"bonus":false,"amount_won":7000000,"winners":1,"payout":"annuity","months":240}]',
   'https://synthetic.invalid/pension/2', '00000000-0000-4000-8000-000000000202', now());
