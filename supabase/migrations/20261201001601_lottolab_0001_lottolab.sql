-- LOTTO-LAB user안(개인형): 소유 user_id → auth.users, RLS auth.uid() = user_id. 공개 추첨 데이터는 anon 읽기.
-- 근거: tasks/task-012-product-ports.md, docs/design/04-products/survey-lotto-lab.md. 전제: nomad_core.touch_updated_at() 존재.
begin;

create schema nomad_lottolab;
grant usage on schema nomad_lottolab to anon, authenticated, service_role;
create schema nomad_lottolab_private;
revoke all on schema nomad_lottolab_private from public, anon, authenticated;
grant usage on schema nomad_lottolab_private to service_role;

create type nomad_lottolab.game_type as enum ('lotto', 'pension');
comment on type nomad_lottolab.game_type is '게임 종류: lotto(로또 6/45) | pension(연금복권 720+).';

-- ── 공개·수집 데이터 (소유 없음, anon 공개 읽기) ──────────────────────────
create table nomad_lottolab.ingestion_runs (
  id                uuid        primary key default gen_random_uuid(),
  game              nomad_lottolab.game_type not null,
  draw_no           int         not null,
  source_url        text        not null,
  fetched_at        timestamptz not null,
  payload_sha256    text        not null,
  raw_payload       jsonb       not null,
  status            text        not null,
  validation_errors jsonb,
  reverified_at     timestamptz,
  reverify_errors   jsonb,
  reviewed_by       uuid        references auth.users (id) on delete set null,
  reviewed_at       timestamptz,
  review_note       text,
  created_at        timestamptz not null default now(),
  constraint ingestion_runs_status_chk check (status in ('verified', 'needs_review', 'approved', 'rejected')),
  constraint ingestion_runs_game_draw_payload_key unique (game, draw_no, payload_sha256)
);
comment on table nomad_lottolab.ingestion_runs is '공식 회차 수집 이력(삭제 금지). service_role만 접근.';
create index ingestion_runs_status_fetched_at_idx on nomad_lottolab.ingestion_runs (status, fetched_at desc);
create index ingestion_runs_game_draw_no_idx on nomad_lottolab.ingestion_runs (game, draw_no);
alter table nomad_lottolab.ingestion_runs enable row level security;
revoke all on table nomad_lottolab.ingestion_runs from anon, authenticated, public, service_role;
grant select, insert on table nomad_lottolab.ingestion_runs to service_role;
grant update (status, validation_errors, reverified_at, reverify_errors, reviewed_by, reviewed_at, review_note)
  on table nomad_lottolab.ingestion_runs to service_role;

create table nomad_lottolab.draws_lotto (
  draw_no            int         primary key,
  draw_date          date        not null,
  nums               smallint[]  not null,
  bonus              smallint    not null,
  prizes             jsonb       not null,
  source_url         text        not null,
  ingestion_run_id   uuid        not null references nomad_lottolab.ingestion_runs (id) on delete restrict,
  source_verified_at timestamptz not null,
  created_at         timestamptz not null default now(),
  constraint draws_lotto_draw_no_chk check (draw_no > 0),
  constraint draws_lotto_draw_date_key unique (draw_date),
  constraint draws_lotto_nums_chk check (
    array_ndims(nums) = 1 and array_lower(nums, 1) = 1 and cardinality(nums) = 6
    and array_position(nums, null) is null
    and 1 <= nums[1] and nums[1] < nums[2] and nums[2] < nums[3]
    and nums[3] < nums[4] and nums[4] < nums[5] and nums[5] < nums[6] and nums[6] <= 45
  ),
  constraint draws_lotto_bonus_chk check (bonus between 1 and 45 and bonus <> all (nums)),
  constraint draws_lotto_prizes_chk check (jsonb_typeof(prizes) = 'array')
);
comment on table nomad_lottolab.draws_lotto is '로또 6/45 공식 회차 결과. 공개 SELECT, 쓰기는 service_role만.';
alter table nomad_lottolab.draws_lotto enable row level security;
revoke all on table nomad_lottolab.draws_lotto from anon, authenticated, public, service_role;
grant select on table nomad_lottolab.draws_lotto to anon, authenticated;
grant select, insert, update on table nomad_lottolab.draws_lotto to service_role;
create policy draws_lotto_select_public on nomad_lottolab.draws_lotto
  for select to anon, authenticated using (true);

create table nomad_lottolab.draws_pension (
  draw_no            int         primary key,
  draw_date          date        not null,
  group_no           smallint    not null,
  digits             char(6)     not null,
  bonus_digits       char(6)     not null,
  prizes             jsonb       not null,
  source_url         text        not null,
  ingestion_run_id   uuid        not null references nomad_lottolab.ingestion_runs (id) on delete restrict,
  source_verified_at timestamptz not null,
  created_at         timestamptz not null default now(),
  constraint draws_pension_draw_no_chk check (draw_no > 0),
  constraint draws_pension_draw_date_key unique (draw_date),
  constraint draws_pension_group_no_chk check (group_no between 1 and 5),
  constraint draws_pension_digits_chk check (digits ~ '^[0-9]{6}$'),
  constraint draws_pension_bonus_digits_chk check (bonus_digits ~ '^[0-9]{6}$'),
  constraint draws_pension_prizes_chk check (jsonb_typeof(prizes) = 'array')
);
comment on table nomad_lottolab.draws_pension is '연금복권 720+ 공식 회차 결과(번호는 6자리 문자열). 공개 SELECT, 쓰기는 service_role만.';
alter table nomad_lottolab.draws_pension enable row level security;
revoke all on table nomad_lottolab.draws_pension from anon, authenticated, public, service_role;
grant select on table nomad_lottolab.draws_pension to anon, authenticated;
grant select, insert, update on table nomad_lottolab.draws_pension to service_role;
create policy draws_pension_select_public on nomad_lottolab.draws_pension
  for select to anon, authenticated using (true);

create table nomad_lottolab.statistics_cache (
  game        nomad_lottolab.game_type not null,
  window_key  text        not null,
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
comment on table nomad_lottolab.statistics_cache is '통계 집계 캐시. 공개 SELECT, 쓰기(재계산)는 service_role만.';
alter table nomad_lottolab.statistics_cache enable row level security;
revoke all on table nomad_lottolab.statistics_cache from anon, authenticated, public, service_role;
grant select on table nomad_lottolab.statistics_cache to anon, authenticated;
grant select, insert, update, delete on table nomad_lottolab.statistics_cache to service_role;
create policy statistics_cache_select_public on nomad_lottolab.statistics_cache
  for select to anon, authenticated using (true);

-- ── 사전알림 (소유 없음, service_role 전용: EF가 Turnstile·레이트리밋 뒤 기록) ──
create table nomad_lottolab.waitlist_signups (
  id                   uuid        primary key default gen_random_uuid(),
  email                text        not null,
  email_norm           text        generated always as (lower(trim(email))) stored,
  consent_marketing    boolean     not null,
  age_confirmed        boolean     not null,
  consented_at         timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  confirmed_at         timestamptz,
  confirm_token_hash   text,
  confirm_expires_at   timestamptz,
  confirm_sends        int         not null default 0,
  confirm_window_start timestamptz,
  constraint waitlist_signups_email_len_chk check (length(email) <= 254),
  constraint waitlist_signups_consent_marketing_chk check (consent_marketing = true),
  constraint waitlist_signups_age_confirmed_chk check (age_confirmed = true),
  constraint waitlist_signups_email_norm_key unique (email_norm),
  constraint waitlist_signups_confirm_token_hash_chk
    check (confirm_token_hash is null or confirm_token_hash ~ '^[0-9a-f]{64}$')
);
comment on table nomad_lottolab.waitlist_signups is '사전알림 신청(이중 확인). 정책 없음, service_role만 접근, 6개월 후 삭제.';
create index waitlist_signups_created_at_idx on nomad_lottolab.waitlist_signups (created_at);
create index waitlist_signups_confirm_token_hash_idx
  on nomad_lottolab.waitlist_signups (confirm_token_hash) where confirm_token_hash is not null;
create index waitlist_signups_unconfirmed_expires_idx
  on nomad_lottolab.waitlist_signups (confirm_expires_at) where confirmed_at is null;
alter table nomad_lottolab.waitlist_signups enable row level security;
revoke all on table nomad_lottolab.waitlist_signups from anon, authenticated, public;
grant select, insert, update, delete on table nomad_lottolab.waitlist_signups to service_role;

create table nomad_lottolab_private.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  hits         int         not null default 0,
  primary key (key, window_start)
);
comment on table nomad_lottolab_private.rate_limits is '고정 창 레이트리밋 카운터(원문 IP 저장 안 함). service_role만.';
create index rate_limits_window_start_idx on nomad_lottolab_private.rate_limits (window_start);
alter table nomad_lottolab_private.rate_limits enable row level security;
revoke all on table nomad_lottolab_private.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table nomad_lottolab_private.rate_limits to service_role;

create function nomad_lottolab.waitlist_rate_hit(p_key text, p_window_sec int, p_max int)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits   int;
begin
  if p_key is null or length(p_key) = 0 or p_window_sec is null or p_window_sec <= 0
     or p_max is null or p_max <= 0 then
    raise exception 'waitlist_rate_hit: invalid arguments' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_sec) * p_window_sec);
  insert into nomad_lottolab_private.rate_limits as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  return v_hits <= p_max;
end;
$$;
comment on function nomad_lottolab.waitlist_rate_hit(text, int, int) is 'IP 레이트리밋: 창 카운터 원자 증가, 한도 이내면 true. service_role 전용.';
revoke execute on function nomad_lottolab.waitlist_rate_hit(text, int, int) from public, anon, authenticated;
grant execute on function nomad_lottolab.waitlist_rate_hit(text, int, int) to service_role;

create function nomad_lottolab.waitlist_request_confirm(
  p_email text, p_token_hash text, p_ttl_sec int, p_max_sends int, p_window_sec int
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if p_email is null or length(p_email) = 0 or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_ttl_sec is null or p_ttl_sec <= 0 or p_max_sends is null or p_max_sends <= 0
     or p_window_sec is null or p_window_sec <= 0 then
    raise exception 'waitlist_request_confirm: invalid arguments' using errcode = '22023';
  end if;

  insert into nomad_lottolab.waitlist_signups as w
    (email, consent_marketing, age_confirmed, consented_at,
     confirm_token_hash, confirm_expires_at, confirm_sends, confirm_window_start)
  values
    (p_email, true, true, now(),
     p_token_hash, now() + make_interval(secs => p_ttl_sec), 1, now())
  on conflict (email_norm) do update set
    consented_at         = now(),
    confirm_token_hash   = excluded.confirm_token_hash,
    confirm_expires_at   = excluded.confirm_expires_at,
    confirm_sends        = case
                             when w.confirm_window_start is null
                               or w.confirm_window_start <= now() - make_interval(secs => p_window_sec)
                             then 1 else w.confirm_sends + 1 end,
    confirm_window_start = case
                             when w.confirm_window_start is null
                               or w.confirm_window_start <= now() - make_interval(secs => p_window_sec)
                             then now() else w.confirm_window_start end
  where w.confirmed_at is null
    and (w.confirm_expires_at is null or w.confirm_expires_at <= now())
    and (w.confirm_window_start is null
         or w.confirm_window_start <= now() - make_interval(secs => p_window_sec)
         or w.confirm_sends < p_max_sends)
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;
comment on function nomad_lottolab.waitlist_request_confirm(text, text, int, int, int) is
  '미확인 행만 확인 토큰 해시·만료·발송 카운트를 원자 갱신하고 메일 발송 여부를 돌려준다. service_role 전용.';
revoke execute on function nomad_lottolab.waitlist_request_confirm(text, text, int, int, int) from public, anon, authenticated;
grant execute on function nomad_lottolab.waitlist_request_confirm(text, text, int, int, int) to service_role;

create function nomad_lottolab.waitlist_confirm(p_token_hash text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  update nomad_lottolab.waitlist_signups
     set confirmed_at = now(), consented_at = now()
   where confirm_token_hash = p_token_hash
     and confirm_expires_at > now()
     and confirmed_at is null;
  if found then
    return true;
  end if;
  return exists (
    select 1 from nomad_lottolab.waitlist_signups
     where confirm_token_hash = p_token_hash
       and confirm_expires_at > now()
       and confirmed_at is not null
  );
end;
$$;
comment on function nomad_lottolab.waitlist_confirm(text) is '확인 토큰 해시로 이메일 확인을 확정한다(재제출도 만료 전이면 true). service_role 전용.';
revoke execute on function nomad_lottolab.waitlist_confirm(text) from public, anon, authenticated;
grant execute on function nomad_lottolab.waitlist_confirm(text) to service_role;

-- 보관 기간 삭제(pg_cron이 설치된 경우에만 등록)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('waitlist_purge_6m', '17 3 * * *',
      $c$delete from nomad_lottolab.waitlist_signups where created_at < now() - interval '6 months'$c$);
    perform cron.schedule('rate_limits_purge', '27 3 * * *',
      $c$delete from nomad_lottolab_private.rate_limits where window_start < now() - interval '1 day'$c$);
    perform cron.schedule('waitlist_purge_unconfirmed', '47 * * * *',
      $c$delete from nomad_lottolab.waitlist_signups where confirmed_at is null and confirm_expires_at < now()$c$);
  end if;
end;
$$;

-- ── 번호 형식 검증 함수 (CHECK용, IMMUTABLE, 내부 스키마) ─────────────────────
-- CHECK 안 함수 호출은 실행 시 EXECUTE 권한을 검사하므로 authenticated·service_role에 GRANT.
create function nomad_lottolab_private.valid_numbers(p_game nomad_lottolab.game_type, p_data jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_keys text[];
  v_elem jsonb;
  v_num  numeric;
  v_prev numeric := 0;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return false;
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_data) k;
  if p_game = 'lotto' then
    if v_keys is distinct from array['nums'] then return false; end if;
    if jsonb_typeof(p_data -> 'nums') <> 'array' then return false; end if;
    if jsonb_array_length(p_data -> 'nums') <> 6 then return false; end if;
    for v_elem in select e from jsonb_array_elements(p_data -> 'nums') e loop
      if jsonb_typeof(v_elem) <> 'number' then return false; end if;
      v_num := v_elem::numeric;
      if v_num <> trunc(v_num) or v_num < 1 or v_num > 45 or v_num <= v_prev then return false; end if;
      v_prev := v_num;
    end loop;
    return true;
  elsif p_game = 'pension' then
    if v_keys is distinct from array['digits'] then return false; end if;
    return jsonb_typeof(p_data -> 'digits') = 'string' and (p_data ->> 'digits') ~ '^[0-9]{6}$';
  end if;
  return false;
end;
$$;
comment on function nomad_lottolab_private.valid_numbers(nomad_lottolab.game_type, jsonb) is
  '생성 번호 jsonb 검증: 로또 {"nums":[정수 6개 1~45 오름차순]} / 연금 {"digits":"6자리 문자열"}. 추가 키 금지.';

create function nomad_lottolab_private.valid_ticket(p_game nomad_lottolab.game_type, p_data jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_keys  text[];
  v_elem  jsonb;
  v_num   numeric;
  v_prev  numeric := 0;
  v_group numeric;
begin
  -- valid_numbers를 이름으로 부르지 않는다: 실행 시 private 스키마 USAGE가 필요해진다.
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return false;
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_data) k;
  if p_game = 'lotto' then
    if v_keys is distinct from array['nums'] then return false; end if;
    if jsonb_typeof(p_data -> 'nums') <> 'array' then return false; end if;
    if jsonb_array_length(p_data -> 'nums') <> 6 then return false; end if;
    for v_elem in select e from jsonb_array_elements(p_data -> 'nums') e loop
      if jsonb_typeof(v_elem) <> 'number' then return false; end if;
      v_num := v_elem::numeric;
      if v_num <> trunc(v_num) or v_num < 1 or v_num > 45 or v_num <= v_prev then return false; end if;
      v_prev := v_num;
    end loop;
    return true;
  elsif p_game = 'pension' then
    if v_keys is distinct from array['digits', 'group_no'] then return false; end if;
    if jsonb_typeof(p_data -> 'group_no') <> 'number' then return false; end if;
    v_group := (p_data -> 'group_no')::numeric;
    if v_group <> trunc(v_group) or v_group < 1 or v_group > 5 then return false; end if;
    return jsonb_typeof(p_data -> 'digits') = 'string' and (p_data ->> 'digits') ~ '^[0-9]{6}$';
  end if;
  return false;
end;
$$;
comment on function nomad_lottolab_private.valid_ticket(nomad_lottolab.game_type, jsonb) is
  '저장 티켓 jsonb 검증: 로또 {"nums":[...]} / 연금 {"group_no":1~5,"digits":"6자리 문자열"}. 추가 키 금지.';

revoke all on function nomad_lottolab_private.valid_numbers(nomad_lottolab.game_type, jsonb) from public, anon, authenticated;
revoke all on function nomad_lottolab_private.valid_ticket(nomad_lottolab.game_type, jsonb) from public, anon, authenticated;
grant execute on function nomad_lottolab_private.valid_numbers(nomad_lottolab.game_type, jsonb) to authenticated, service_role;
grant execute on function nomad_lottolab_private.valid_ticket(nomad_lottolab.game_type, jsonb) to authenticated, service_role;

-- ── 사용자 데이터 (소유 user_id → auth.users, 본인 행만) ───────────────────
create table nomad_lottolab.generator_profiles (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  game       nomad_lottolab.game_type not null,
  name       text        not null,
  config     jsonb       not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint generator_profiles_name_len_chk check (char_length(name) <= 50),
  constraint generator_profiles_config_size_chk check (octet_length(config::text) <= 4096)
);
comment on table nomad_lottolab.generator_profiles is '사용자 생성 조건 프리셋. 본인 행만 CRUD.';
create index generator_profiles_user_id_idx on nomad_lottolab.generator_profiles (user_id, updated_at);
create trigger generator_profiles_touch_updated_at
  before update on nomad_lottolab.generator_profiles
  for each row execute function nomad_core.touch_updated_at();
alter table nomad_lottolab.generator_profiles enable row level security;
revoke all on table nomad_lottolab.generator_profiles from anon, authenticated, public, service_role;
grant select, insert, delete on table nomad_lottolab.generator_profiles to authenticated;
grant update (name, config, deleted_at) on table nomad_lottolab.generator_profiles to authenticated;
create policy generator_profiles_select_own on nomad_lottolab.generator_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy generator_profiles_insert_own on nomad_lottolab.generator_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy generator_profiles_update_own on nomad_lottolab.generator_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy generator_profiles_delete_own on nomad_lottolab.generator_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

create table nomad_lottolab.generated_batches (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  game           nomad_lottolab.game_type not null,
  round          int,
  strategy       text        not null,
  method         text        not null default 'random',
  engine_version text        not null,
  created_at     timestamptz not null default now(),
  constraint generated_batches_method_chk
    check (method in ('random', 'condition', 'zodiac', 'birthday', 'dream', 'saju')),
  constraint generated_batches_strategy_len_chk check (char_length(strategy) <= 64),
  constraint generated_batches_engine_version_len_chk check (char_length(engine_version) <= 64),
  constraint generated_batches_id_game_key unique (id, game)
);
comment on table nomad_lottolab.generated_batches is '번호 생성 이력 배치(추가 전용). 본인 SELECT/INSERT/DELETE, UPDATE 없음.';
create index generated_batches_user_created_idx on nomad_lottolab.generated_batches (user_id, created_at desc);
alter table nomad_lottolab.generated_batches enable row level security;
revoke all on table nomad_lottolab.generated_batches from anon, authenticated, public, service_role;
grant select, insert, delete on table nomad_lottolab.generated_batches to authenticated;
create policy generated_batches_select_own on nomad_lottolab.generated_batches
  for select to authenticated using ((select auth.uid()) = user_id);
create policy generated_batches_insert_own on nomad_lottolab.generated_batches
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy generated_batches_delete_own on nomad_lottolab.generated_batches
  for delete to authenticated using ((select auth.uid()) = user_id);

create table nomad_lottolab.generated_numbers (
  id         uuid        primary key default gen_random_uuid(),
  batch_id   uuid        not null,
  game       nomad_lottolab.game_type not null,
  line_no    smallint    not null,
  numbers    jsonb       not null,
  group_no   smallint,
  created_at timestamptz not null default now(),
  constraint generated_numbers_batch_fk foreign key (batch_id, game)
    references nomad_lottolab.generated_batches (id, game) on delete cascade,
  constraint generated_numbers_line_no_chk check (line_no between 1 and 50),
  constraint generated_numbers_batch_line_key unique (batch_id, line_no),
  constraint generated_numbers_size_chk check (octet_length(numbers::text) <= 4096),
  constraint generated_numbers_numbers_chk check (nomad_lottolab_private.valid_numbers(game, numbers)),
  constraint generated_numbers_group_no_chk check (
    (game = 'lotto' and group_no is null) or (game = 'pension' and group_no between 1 and 5)
  )
);
comment on table nomad_lottolab.generated_numbers is '생성 배치의 번호 줄(추가 전용). 소유는 batch_id 경유 본인 배치.';
alter table nomad_lottolab.generated_numbers enable row level security;
revoke all on table nomad_lottolab.generated_numbers from anon, authenticated, public, service_role;
grant select, insert, delete on table nomad_lottolab.generated_numbers to authenticated;
create policy generated_numbers_select_own on nomad_lottolab.generated_numbers
  for select to authenticated using (exists (
    select 1 from nomad_lottolab.generated_batches b where b.id = batch_id and b.user_id = (select auth.uid())));
create policy generated_numbers_insert_own on nomad_lottolab.generated_numbers
  for insert to authenticated with check (exists (
    select 1 from nomad_lottolab.generated_batches b where b.id = batch_id and b.user_id = (select auth.uid())));
create policy generated_numbers_delete_own on nomad_lottolab.generated_numbers
  for delete to authenticated using (exists (
    select 1 from nomad_lottolab.generated_batches b where b.id = batch_id and b.user_id = (select auth.uid())));

create table nomad_lottolab.saved_tickets (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users (id) on delete cascade,
  game             nomad_lottolab.game_type not null,
  round            int,
  ticket_data      jsonb       not null,
  purchase_status  text        not null,
  purchase_date    date,
  amount_won       bigint,
  source_number_id uuid        references nomad_lottolab.generated_numbers (id) on delete set null,
  idempotency_key  uuid        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint saved_tickets_status_chk check (purchase_status in ('favorite', 'purchased')),
  constraint saved_tickets_amount_chk check (amount_won >= 0),
  constraint saved_tickets_status_cols_chk check (
    (purchase_status = 'favorite' and purchase_date is null and amount_won is null)
    or (purchase_status = 'purchased' and purchase_date is not null)
  ),
  constraint saved_tickets_size_chk check (octet_length(ticket_data::text) <= 4096),
  constraint saved_tickets_ticket_data_chk check (nomad_lottolab_private.valid_ticket(game, ticket_data)),
  constraint saved_tickets_user_idempotency_key unique (user_id, idempotency_key),
  constraint saved_tickets_id_game_key unique (id, game)
);
comment on table nomad_lottolab.saved_tickets is '즐겨찾기·실제 구매 티켓. 본인 SELECT/INSERT/DELETE, UPDATE는 구매 상태 열만, 역전환은 PT422.';
create index saved_tickets_user_created_idx on nomad_lottolab.saved_tickets (user_id, created_at desc);
create index saved_tickets_user_updated_idx on nomad_lottolab.saved_tickets (user_id, updated_at);
create trigger saved_tickets_touch_updated_at
  before update on nomad_lottolab.saved_tickets
  for each row execute function nomad_core.touch_updated_at();
create index saved_tickets_game_round_status_idx on nomad_lottolab.saved_tickets (game, round, purchase_status);
create index saved_tickets_source_number_id_idx on nomad_lottolab.saved_tickets (source_number_id);
alter table nomad_lottolab.saved_tickets enable row level security;
revoke all on table nomad_lottolab.saved_tickets from anon, authenticated, public, service_role;
grant select, insert, delete on table nomad_lottolab.saved_tickets to authenticated;
grant update (purchase_status, purchase_date, amount_won, deleted_at) on table nomad_lottolab.saved_tickets to authenticated;
grant select on table nomad_lottolab.saved_tickets to service_role;
create policy saved_tickets_select_own on nomad_lottolab.saved_tickets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy saved_tickets_insert_own on nomad_lottolab.saved_tickets
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy saved_tickets_update_own on nomad_lottolab.saved_tickets
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy saved_tickets_delete_own on nomad_lottolab.saved_tickets
  for delete to authenticated using ((select auth.uid()) = user_id);

create function nomad_lottolab_private.saved_tickets_guard_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.purchase_status = 'purchased' and new.purchase_status = 'favorite' then
    raise exception using errcode = 'PT422', message = 'INVALID_TRANSITION',
      detail = 'purchased → favorite 전환은 허용되지 않습니다.';
  end if;
  return new;
end;
$$;
comment on function nomad_lottolab_private.saved_tickets_guard_transition() is 'saved_tickets BEFORE UPDATE: purchased→favorite 역전환 거부(PT422).';
create trigger saved_tickets_guard_transition
  before update of purchase_status on nomad_lottolab.saved_tickets
  for each row execute function nomad_lottolab_private.saved_tickets_guard_transition();

create function nomad_lottolab_private.saved_tickets_check_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source_number_id is not null and not exists (
    select 1
      from nomad_lottolab.generated_numbers n
      join nomad_lottolab.generated_batches b on b.id = n.batch_id
     where n.id = new.source_number_id and b.user_id = new.user_id
  ) then
    raise exception using errcode = '23503', message = 'INVALID_SOURCE_NUMBER',
      detail = 'source_number_id는 본인의 생성 번호여야 합니다.';
  end if;
  return new;
end;
$$;
comment on function nomad_lottolab_private.saved_tickets_check_source() is 'saved_tickets BEFORE INSERT/UPDATE: source_number_id가 같은 사용자의 생성 번호인지 검사.';
create trigger saved_tickets_check_source
  before insert or update of source_number_id, user_id on nomad_lottolab.saved_tickets
  for each row execute function nomad_lottolab_private.saved_tickets_check_source();
revoke all on function nomad_lottolab_private.saved_tickets_guard_transition() from public, anon, authenticated;
revoke all on function nomad_lottolab_private.saved_tickets_check_source() from public, anon, authenticated;

create table nomad_lottolab.draw_checks (
  id           uuid        primary key default gen_random_uuid(),
  ticket_id    uuid        not null,
  game         nomad_lottolab.game_type not null,
  draw_no      int         not null,
  matched_rank smallint,
  bonus_hit    boolean     not null default false,
  checked_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  constraint draw_checks_ticket_fk foreign key (ticket_id, game)
    references nomad_lottolab.saved_tickets (id, game) on delete cascade,
  constraint draw_checks_bonus_hit_chk check (game = 'pension' or not bonus_hit)
);
comment on table nomad_lottolab.draw_checks is '티켓 당첨 판정 이력(누적). 사용자는 본인 티켓 SELECT만, 쓰기는 service_role.';
create index draw_checks_ticket_draw_idx on nomad_lottolab.draw_checks (ticket_id, draw_no);
alter table nomad_lottolab.draw_checks enable row level security;
revoke all on table nomad_lottolab.draw_checks from anon, authenticated, public, service_role;
grant select on table nomad_lottolab.draw_checks to authenticated;
grant select, insert on table nomad_lottolab.draw_checks to service_role;
create policy draw_checks_select_own on nomad_lottolab.draw_checks
  for select to authenticated using (exists (
    select 1 from nomad_lottolab.saved_tickets t where t.id = ticket_id and t.user_id = (select auth.uid())));

create table nomad_lottolab.fortune_profiles (
  user_id       uuid        primary key references auth.users (id) on delete cascade,
  birth_date    text        not null,
  calendar      text        not null,
  is_leap_month boolean     not null default false,
  birth_hour    text,
  consented_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint fortune_profiles_calendar_chk check (calendar in ('solar', 'lunar')),
  constraint fortune_profiles_birth_date_chk check (
    case
      when birth_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then false
      when calendar = 'solar' then pg_input_is_valid(birth_date, 'date')
      when calendar = 'lunar' then substr(birth_date, 6, 2) between '01' and '12'
                               and substr(birth_date, 9, 2) between '01' and '30'
      else false
    end
  ),
  constraint fortune_profiles_birth_date_range_chk check (
    birth_date >= '1900-01-01'
    and birth_date <= to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')
  ),
  constraint fortune_profiles_leap_chk check (not is_leap_month or calendar = 'lunar'),
  constraint fortune_profiles_birth_hour_chk check (
    birth_hour in ('ja', 'chuk', 'in', 'myo', 'jin', 'sa', 'o', 'mi', 'sin', 'yu', 'sul', 'hae')
  )
);
comment on table nomad_lottolab.fortune_profiles is '사주 번호용 생년월일 프로필(개인정보). 1인 1행, 본인만 CRUD, 계정 삭제 시 CASCADE 파기.';
alter table nomad_lottolab.fortune_profiles enable row level security;
revoke all on table nomad_lottolab.fortune_profiles from anon, authenticated, public, service_role;
grant select, delete on table nomad_lottolab.fortune_profiles to authenticated;
grant insert (user_id, birth_date, calendar, is_leap_month, birth_hour) on table nomad_lottolab.fortune_profiles to authenticated;
grant update (user_id, birth_date, calendar, is_leap_month, birth_hour, deleted_at) on table nomad_lottolab.fortune_profiles to authenticated;
create policy fortune_profiles_select_own on nomad_lottolab.fortune_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy fortune_profiles_insert_own on nomad_lottolab.fortune_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy fortune_profiles_update_own on nomad_lottolab.fortune_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy fortune_profiles_delete_own on nomad_lottolab.fortune_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger fortune_profiles_touch_updated_at
  before update on nomad_lottolab.fortune_profiles
  for each row execute function nomad_core.touch_updated_at();

create table nomad_lottolab.user_consents (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null,  -- FK 없음: 계정 삭제 뒤에도 동의 이력 보관(2026-11-16 결정, 보관 기간은 법무 확인 전 미정)
  terms_version    text        not null,
  privacy_version  text        not null,
  adult_confirmed  boolean     not null,
  consented_at     timestamptz not null default now(),
  constraint user_consents_adult_chk check (adult_confirmed = true),
  constraint user_consents_terms_version_chk check (char_length(terms_version) between 1 and 32),
  constraint user_consents_privacy_version_chk check (char_length(privacy_version) between 1 and 32)
);
comment on table nomad_lottolab.user_consents is '가입 동의 기록(약관·개인정보·만 19세). 본인 SELECT/INSERT만(추가 전용), consented_at은 서버 시각. 계정 삭제 뒤에도 보관(user_id는 FK 없는 값).';
create index user_consents_user_id_idx on nomad_lottolab.user_consents (user_id, consented_at desc);
alter table nomad_lottolab.user_consents enable row level security;
revoke all on table nomad_lottolab.user_consents from anon, authenticated, public, service_role;
grant select on table nomad_lottolab.user_consents to authenticated;
grant insert (user_id, terms_version, privacy_version, adult_confirmed) on table nomad_lottolab.user_consents to authenticated;
create policy user_consents_select_own on nomad_lottolab.user_consents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_consents_insert_own on nomad_lottolab.user_consents
  for insert to authenticated with check ((select auth.uid()) = user_id);

commit;
