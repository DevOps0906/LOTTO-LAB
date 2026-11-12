-- task-007 공개·수집 스키마: game_type · ingestion_runs · draws_lotto · draws_pension · statistics_cache
-- 근거: docs/05_DATA_MODEL.md#1·#2·#3·#4·#5, docs/04_API.md#1 A-01·A-02·A-06
-- 권한: 새 테이블은 anon·authenticated·public 권한을 모두 회수한 뒤 필요한 것만 GRANT.
--       공개 테이블(draws_*·statistics_cache)은 SELECT만, ingestion_runs는 service_role만.

-- 0) 게임 종류 -------------------------------------------------------------------
create type public.game_type as enum ('lotto', 'pension');

comment on type public.game_type is '게임 종류: lotto(로또 6/45) | pension(연금복권 720+).';

-- 1) 수집 이력 (provenance, 05#5) -------------------------------------------------
create table public.ingestion_runs (
  id                uuid        primary key default gen_random_uuid(),
  game              public.game_type not null,
  draw_no           int         not null,
  source_url        text        not null,
  fetched_at        timestamptz not null,
  payload_sha256    text        not null,
  raw_payload       jsonb       not null,
  status            text        not null,
  validation_errors jsonb,
  reverified_at     timestamptz,
  reverify_errors   jsonb,                -- NULL = 재검증 통과(R9)
  reviewed_by       uuid        references auth.users (id) on delete set null,
  reviewed_at       timestamptz,
  review_note       text,
  created_at        timestamptz not null default now(),
  constraint ingestion_runs_status_chk
    check (status in ('verified', 'needs_review', 'approved', 'rejected')),
  constraint ingestion_runs_game_draw_payload_key unique (game, draw_no, payload_sha256)
);

comment on table public.ingestion_runs is
  '공식 회차 수집 이력(D7). 삭제 금지·이력 정본 — draws_*가 ON DELETE RESTRICT로 참조. 접근은 service_role만(워커·A-11~A-13·A-16).';

create index ingestion_runs_status_fetched_at_idx on public.ingestion_runs (status, fetched_at desc);
create index ingestion_runs_game_draw_no_idx on public.ingestion_runs (game, draw_no);

-- RLS 활성 + 정책 없음 = anon·authenticated 전면 거부.
alter table public.ingestion_runs enable row level security;
-- 삭제 금지(이력 정본): service_role도 DELETE·TRUNCATE 없음.
-- UPDATE는 검증·재검증·검토 열만(수집 원본 source_url·raw_payload·payload_sha256 등은 불변).
revoke all on table public.ingestion_runs from anon, authenticated, public, service_role;
grant select, insert on table public.ingestion_runs to service_role;
grant update (status, validation_errors, reverified_at, reverify_errors, reviewed_by, reviewed_at, review_note)
  on table public.ingestion_runs to service_role;

-- 2) 로또 회차 ------------------------------------------------------------------
create table public.draws_lotto (
  draw_no            int         primary key,
  draw_date          date        not null,
  nums               smallint[]  not null,
  bonus              smallint    not null,
  prizes             jsonb       not null,
  source_url         text        not null,
  ingestion_run_id   uuid        not null references public.ingestion_runs (id) on delete restrict,
  source_verified_at timestamptz not null,
  created_at         timestamptz not null default now(),
  constraint draws_lotto_draw_no_chk check (draw_no > 0),
  constraint draws_lotto_draw_date_key unique (draw_date),
  -- 1차원·하한 1·길이 6·NULL 요소 없음 + 범위·엄격 오름차순 사슬(= 중복 없음)
  constraint draws_lotto_nums_chk check (
    array_ndims(nums) = 1
    and array_lower(nums, 1) = 1
    and cardinality(nums) = 6
    and array_position(nums, null) is null
    and 1 <= nums[1]
    and nums[1] < nums[2]
    and nums[2] < nums[3]
    and nums[3] < nums[4]
    and nums[4] < nums[5]
    and nums[5] < nums[6]
    and nums[6] <= 45
  ),
  constraint draws_lotto_bonus_chk check (bonus between 1 and 45 and bonus <> all (nums)),
  constraint draws_lotto_prizes_chk check (jsonb_typeof(prizes) = 'array')
);

comment on table public.draws_lotto is
  '로또 6/45 공식 회차 결과(A-01·A-03). nums 오름차순 6개·bonus 별도. 공개 SELECT, 쓰기는 service_role만(워커·A-12).';

alter table public.draws_lotto enable row level security;
revoke all on table public.draws_lotto from anon, authenticated, public, service_role;
grant select on table public.draws_lotto to anon, authenticated;
grant select, insert, update on table public.draws_lotto to service_role;  -- UPSERT만, DELETE·TRUNCATE 없음

create policy draws_lotto_select_public on public.draws_lotto
  for select to anon, authenticated using (true);

-- 3) 연금복권 회차 (번호는 문자열, 앞자리 0 보존 05#4) ---------------------------
create table public.draws_pension (
  draw_no            int         primary key,
  draw_date          date        not null,
  group_no           smallint    not null,
  digits             char(6)     not null,
  bonus_digits       char(6)     not null,
  prizes             jsonb       not null,
  source_url         text        not null,
  ingestion_run_id   uuid        not null references public.ingestion_runs (id) on delete restrict,
  source_verified_at timestamptz not null,
  created_at         timestamptz not null default now(),
  constraint draws_pension_draw_no_chk check (draw_no > 0),
  constraint draws_pension_draw_date_key unique (draw_date),
  constraint draws_pension_group_no_chk check (group_no between 1 and 5),
  constraint draws_pension_digits_chk check (digits ~ '^[0-9]{6}$'),
  constraint draws_pension_bonus_digits_chk check (bonus_digits ~ '^[0-9]{6}$'),
  constraint draws_pension_prizes_chk check (jsonb_typeof(prizes) = 'array')
);

comment on table public.draws_pension is
  '연금복권 720+ 공식 회차 결과(A-02·A-03). digits·bonus_digits는 6자리 문자열(앞자리 0 보존). 공개 SELECT, 쓰기는 service_role만.';

alter table public.draws_pension enable row level security;
revoke all on table public.draws_pension from anon, authenticated, public, service_role;
grant select on table public.draws_pension to anon, authenticated;
grant select, insert, update on table public.draws_pension to service_role;  -- UPSERT만, DELETE·TRUNCATE 없음

create policy draws_pension_select_public on public.draws_pension
  for select to anon, authenticated using (true);

-- 4) 통계 캐시 (A-06) -------------------------------------------------------------
create table public.statistics_cache (
  game        public.game_type not null,
  window_key  text        not null,      -- 예약어 window 회피, API 파라미터 이름은 window
  metric      text        not null,
  payload     jsonb       not null,
  range_from  int         not null,
  range_to    int         not null,
  sample_size int         not null,
  source      text        not null,
  updated_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  primary key (game, window_key, metric),
  constraint statistics_cache_range_chk check (range_from <= range_to),
  constraint statistics_cache_sample_size_chk check (sample_size >= 0)
);

comment on table public.statistics_cache is
  '통계 집계 캐시(A-06). 기간(range_from~range_to)·표본·출처·갱신 시각 필수 표기. 공개 SELECT, 쓰기는 service_role만(재계산).';

alter table public.statistics_cache enable row level security;
revoke all on table public.statistics_cache from anon, authenticated, public, service_role;
grant select on table public.statistics_cache to anon, authenticated;
grant select, insert, update, delete on table public.statistics_cache to service_role;  -- 재계산

create policy statistics_cache_select_public on public.statistics_cache
  for select to anon, authenticated using (true);
