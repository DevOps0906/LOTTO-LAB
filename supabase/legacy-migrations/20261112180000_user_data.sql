-- task-008 사용자 스키마: generator_profiles · generated_batches · generated_numbers · saved_tickets · draw_checks
-- 근거: docs/05_DATA_MODEL.md#1·#2·#3, docs/04_API.md#1 A-07·A-09·A-14, #2 422 INVALID_TRANSITION
-- 권한: 새 테이블은 anon·authenticated·public·service_role 권한을 모두 회수한 뒤 필요한 것만 GRANT.
--       anon은 사용자 테이블 접근 없음. RLS 조건은 (select auth.uid()) (행마다 재평가 방지).

-- 0) 번호 형식 검증 함수 (CHECK용, IMMUTABLE) --------------------------------------
-- private 스키마는 waitlist 마이그레이션에서 생성(사용 권한 service_role만).
-- CHECK 식 안의 함수 호출은 실행 시 EXECUTE 권한을 검사하므로 authenticated·service_role에 GRANT.

-- 생성 번호 형식: 로또 {"nums":[1~45 정수 6개, 엄격 오름차순]} / 연금 {"digits":"^[0-9]{6}$"} — 추가 키 금지.
create function private.valid_numbers(p_game public.game_type, p_data jsonb)
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
    if v_keys is distinct from array['nums'] then
      return false;
    end if;
    if jsonb_typeof(p_data -> 'nums') <> 'array' then
      return false;
    end if;
    if jsonb_array_length(p_data -> 'nums') <> 6 then   -- 배열 확인 뒤에만 호출(OR 평가 순서 비보장)
      return false;
    end if;
    for v_elem in select e from jsonb_array_elements(p_data -> 'nums') e loop
      if jsonb_typeof(v_elem) <> 'number' then
        return false;                       -- "7" 문자열·null·배열 거부
      end if;
      v_num := v_elem::numeric;
      if v_num <> trunc(v_num) then
        return false;                       -- 1.5 등 정수 아님
      end if;
      if v_num < 1 or v_num > 45 or v_num <= v_prev then
        return false;                       -- 범위·엄격 오름차순(= 중복 없음)
      end if;
      v_prev := v_num;
    end loop;
    return true;
  elsif p_game = 'pension' then
    if v_keys is distinct from array['digits'] then
      return false;
    end if;
    return jsonb_typeof(p_data -> 'digits') = 'string'
       and (p_data ->> 'digits') ~ '^[0-9]{6}$';   -- 숫자형 digits 거부, 앞자리 0 보존
  end if;
  return false;
end;
$$;

comment on function private.valid_numbers(public.game_type, jsonb) is
  '생성 번호 jsonb 형식 검증(05#2): 로또 {"nums":[정수 6개 1~45 오름차순]} / 연금 {"digits":"6자리 문자열"}. 추가 키 금지.';

-- 저장 티켓 형식: 로또는 valid_numbers와 같음 / 연금 {"group_no":1~5 정수,"digits":"^[0-9]{6}$"}.
create function private.valid_ticket(p_game public.game_type, p_data jsonb)
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
  -- valid_numbers를 이름으로 호출하지 않는다: 함수 본문의 이름 해석은 실행 시 private 스키마 USAGE가 필요하고
  -- authenticated에는 그 권한이 없다(CHECK 식에 저장된 호출은 OID라 USAGE 불필요). 그래서 로직을 그대로 둔다.
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return false;
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_data) k;

  if p_game = 'lotto' then
    if v_keys is distinct from array['nums'] then
      return false;
    end if;
    if jsonb_typeof(p_data -> 'nums') <> 'array' then
      return false;
    end if;
    if jsonb_array_length(p_data -> 'nums') <> 6 then
      return false;
    end if;
    for v_elem in select e from jsonb_array_elements(p_data -> 'nums') e loop
      if jsonb_typeof(v_elem) <> 'number' then
        return false;
      end if;
      v_num := v_elem::numeric;
      if v_num <> trunc(v_num) or v_num < 1 or v_num > 45 or v_num <= v_prev then
        return false;
      end if;
      v_prev := v_num;
    end loop;
    return true;
  elsif p_game = 'pension' then
    if v_keys is distinct from array['digits', 'group_no'] then
      return false;
    end if;
    if jsonb_typeof(p_data -> 'group_no') <> 'number' then
      return false;
    end if;
    v_group := (p_data -> 'group_no')::numeric;
    if v_group <> trunc(v_group) or v_group < 1 or v_group > 5 then
      return false;
    end if;
    return jsonb_typeof(p_data -> 'digits') = 'string'
       and (p_data ->> 'digits') ~ '^[0-9]{6}$';
  end if;
  return false;
end;
$$;

comment on function private.valid_ticket(public.game_type, jsonb) is
  '저장 티켓 jsonb 형식 검증(05#2): 로또 {"nums":[...]} / 연금 {"group_no":1~5,"digits":"6자리 문자열"}. 추가 키 금지, 숫자는 jsonb number 정수만.';

revoke all on function private.valid_numbers(public.game_type, jsonb) from public, anon, authenticated;
revoke all on function private.valid_ticket(public.game_type, jsonb) from public, anon, authenticated;
grant execute on function private.valid_numbers(public.game_type, jsonb) to authenticated, service_role;
grant execute on function private.valid_ticket(public.game_type, jsonb) to authenticated, service_role;

-- 1) 생성 조건 프리셋 ------------------------------------------------------------
create table public.generator_profiles (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  game       public.game_type not null,
  name       text        not null,
  config     jsonb       not null,
  updated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint generator_profiles_name_len_chk check (char_length(name) <= 50),
  constraint generator_profiles_config_size_chk check (octet_length(config::text) <= 4096)
);

comment on table public.generator_profiles is
  '사용자 생성 조건 프리셋(원본 4.3·4.4). 본인 행만 SELECT/INSERT/UPDATE/DELETE.';

create index generator_profiles_user_id_idx on public.generator_profiles (user_id);

alter table public.generator_profiles enable row level security;
revoke all on table public.generator_profiles from anon, authenticated, public, service_role;
grant select, insert, delete on table public.generator_profiles to authenticated;
grant update (name, config, updated_at) on table public.generator_profiles to authenticated;  -- id·game·user_id 불변

create policy generator_profiles_select_own on public.generator_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy generator_profiles_insert_own on public.generator_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy generator_profiles_update_own on public.generator_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy generator_profiles_delete_own on public.generator_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 2) 생성 배치 (추가 전용) --------------------------------------------------------
create table public.generated_batches (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  game           public.game_type not null,
  round          int,
  strategy       text        not null,
  method         text        not null default 'random',
  engine_version text        not null,
  created_at     timestamptz not null default now(),
  constraint generated_batches_method_chk
    check (method in ('random', 'condition', 'zodiac', 'birthday', 'dream', 'saju')),
  constraint generated_batches_strategy_len_chk check (char_length(strategy) <= 64),
  constraint generated_batches_engine_version_len_chk check (char_length(engine_version) <= 64),
  constraint generated_batches_id_game_key unique (id, game)   -- generated_numbers 복합 FK 대상
);

comment on table public.generated_batches is
  '번호 생성 이력 배치(추천 번호 — 구매·당첨 이력 아님). 추가 전용: 본인 SELECT/INSERT/DELETE, UPDATE 없음(위조 방지).';

create index generated_batches_user_created_idx on public.generated_batches (user_id, created_at desc);

alter table public.generated_batches enable row level security;
revoke all on table public.generated_batches from anon, authenticated, public, service_role;
grant select, insert, delete on table public.generated_batches to authenticated;

create policy generated_batches_select_own on public.generated_batches
  for select to authenticated using ((select auth.uid()) = user_id);
create policy generated_batches_insert_own on public.generated_batches
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy generated_batches_delete_own on public.generated_batches
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 3) 생성 번호 (추가 전용) --------------------------------------------------------
-- game 열: valid_numbers(game, numbers) CHECK에 필요 — 배치와 복합 FK로 같은 게임 강제.
create table public.generated_numbers (
  id         uuid        primary key default gen_random_uuid(),
  batch_id   uuid        not null,
  game       public.game_type not null,
  line_no    smallint    not null,
  numbers    jsonb       not null,
  group_no   smallint,
  created_at timestamptz not null default now(),
  constraint generated_numbers_batch_fk foreign key (batch_id, game)
    references public.generated_batches (id, game) on delete cascade,
  constraint generated_numbers_line_no_chk check (line_no between 1 and 50),   -- 배치당 최대 50줄
  constraint generated_numbers_batch_line_key unique (batch_id, line_no),
  constraint generated_numbers_size_chk check (octet_length(numbers::text) <= 4096),
  constraint generated_numbers_numbers_chk check (private.valid_numbers(game, numbers)),
  constraint generated_numbers_group_no_chk check (
    (game = 'lotto' and group_no is null)
    or (game = 'pension' and group_no between 1 and 5)
  )
);

comment on table public.generated_numbers is
  '생성 배치의 번호 줄(로또 {"nums":[...]} / 연금 {"digits":"000719"} + group_no). 추가 전용, 본인 배치만.';

-- batch_id 단독 인덱스 없음: RLS EXISTS·FK CASCADE의 batch_id 조회는 UNIQUE(batch_id, line_no) 인덱스 선두 열로 처리.

alter table public.generated_numbers enable row level security;
revoke all on table public.generated_numbers from anon, authenticated, public, service_role;
grant select, insert, delete on table public.generated_numbers to authenticated;

create policy generated_numbers_select_own on public.generated_numbers
  for select to authenticated using (exists (
    select 1 from public.generated_batches b where b.id = batch_id and b.user_id = (select auth.uid())));
create policy generated_numbers_insert_own on public.generated_numbers
  for insert to authenticated with check (exists (
    select 1 from public.generated_batches b where b.id = batch_id and b.user_id = (select auth.uid())));
create policy generated_numbers_delete_own on public.generated_numbers
  for delete to authenticated using (exists (
    select 1 from public.generated_batches b where b.id = batch_id and b.user_id = (select auth.uid())));

-- 4) 저장 티켓 (즐겨찾기·실제 구매) ------------------------------------------------
create table public.saved_tickets (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users (id) on delete cascade,
  game             public.game_type not null,
  round            int,
  ticket_data      jsonb       not null,
  purchase_status  text        not null,
  purchase_date    date,
  amount_won       bigint,     -- 사용자가 입력한 구매 금액(원), 당첨금 아님
  source_number_id uuid        references public.generated_numbers (id) on delete set null,
  idempotency_key  uuid        not null,
  created_at       timestamptz not null default now(),
  constraint saved_tickets_status_chk check (purchase_status in ('favorite', 'purchased')),
  constraint saved_tickets_amount_chk check (amount_won >= 0),
  constraint saved_tickets_status_cols_chk check (
    (purchase_status = 'favorite' and purchase_date is null and amount_won is null)
    or (purchase_status = 'purchased' and purchase_date is not null)
  ),
  constraint saved_tickets_size_chk check (octet_length(ticket_data::text) <= 4096),
  constraint saved_tickets_ticket_data_chk check (private.valid_ticket(game, ticket_data)),
  constraint saved_tickets_user_idempotency_key unique (user_id, idempotency_key),   -- R18
  constraint saved_tickets_id_game_key unique (id, game)                              -- draw_checks 복합 FK 대상
);

comment on table public.saved_tickets is
  '즐겨찾기·실제 구매 티켓(생성 이력과 별개). 본인 SELECT/INSERT/DELETE, UPDATE는 구매 상태 열만. purchased→favorite 역전환은 트리거가 PT422로 거부(R19).';

create index saved_tickets_user_created_idx on public.saved_tickets (user_id, created_at desc);
create index saved_tickets_game_round_status_idx on public.saved_tickets (game, round, purchase_status);
create index saved_tickets_source_number_id_idx on public.saved_tickets (source_number_id);  -- FK SET NULL 조회용

alter table public.saved_tickets enable row level security;
revoke all on table public.saved_tickets from anon, authenticated, public, service_role;
grant select, insert, delete on table public.saved_tickets to authenticated;
grant update (purchase_status, purchase_date, amount_won) on table public.saved_tickets to authenticated;  -- 번호·회차·멱등 키 불변
grant select on table public.saved_tickets to service_role;   -- A-09 판정 읽기

create policy saved_tickets_select_own on public.saved_tickets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy saved_tickets_insert_own on public.saved_tickets
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy saved_tickets_update_own on public.saved_tickets
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy saved_tickets_delete_own on public.saved_tickets
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 역전환 거부: purchased → favorite (PostgREST가 PT422를 HTTP 422로 매핑, R19)
create function private.saved_tickets_guard_transition()
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

comment on function private.saved_tickets_guard_transition() is
  'saved_tickets BEFORE UPDATE: purchased→favorite 역전환 거부(SQLSTATE PT422, R19).';

create trigger saved_tickets_guard_transition
  before update of purchase_status on public.saved_tickets
  for each row execute function private.saved_tickets_guard_transition();

-- source_number_id는 같은 사용자의 생성 번호만 (INVOKER: 호출자 RLS + user_id 일치 둘 다 확인)
create function private.saved_tickets_check_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source_number_id is not null and not exists (
    select 1
      from public.generated_numbers n
      join public.generated_batches b on b.id = n.batch_id
     where n.id = new.source_number_id
       and b.user_id = new.user_id
  ) then
    raise exception using errcode = '23503', message = 'INVALID_SOURCE_NUMBER',
      detail = 'source_number_id는 본인의 생성 번호여야 합니다.';
  end if;
  return new;
end;
$$;

comment on function private.saved_tickets_check_source() is
  'saved_tickets BEFORE INSERT/UPDATE: source_number_id가 같은 사용자의 generated_numbers인지 검사(SQLSTATE 23503).';

create trigger saved_tickets_check_source
  before insert or update of source_number_id, user_id on public.saved_tickets
  for each row execute function private.saved_tickets_check_source();

revoke all on function private.saved_tickets_guard_transition() from public, anon, authenticated;
revoke all on function private.saved_tickets_check_source() from public, anon, authenticated;

-- 5) 당첨 판정 이력 (서버만 기록) --------------------------------------------------
create table public.draw_checks (
  id          uuid        primary key default gen_random_uuid(),
  ticket_id   uuid        not null,
  game        public.game_type not null,
  draw_no     int         not null,
  matched_rank smallint,                -- 등위 없음 = NULL
  bonus_hit   boolean     not null default false,
  checked_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  constraint draw_checks_ticket_fk foreign key (ticket_id, game)
    references public.saved_tickets (id, game) on delete cascade,
  constraint draw_checks_bonus_hit_chk check (game = 'pension' or not bonus_hit)   -- 로또 2등은 rank=2
);

comment on table public.draw_checks is
  '티켓 당첨 판정 이력(판정마다 누적, R8). 낙첨 = matched_rank NULL AND NOT bonus_hit. 사용자는 본인 티켓 SELECT만, 쓰기는 service_role(A-09).';

create index draw_checks_ticket_draw_idx on public.draw_checks (ticket_id, draw_no);

alter table public.draw_checks enable row level security;
revoke all on table public.draw_checks from anon, authenticated, public, service_role;
grant select on table public.draw_checks to authenticated;
grant select, insert on table public.draw_checks to service_role;   -- 누적 이력: UPDATE·DELETE 없음

create policy draw_checks_select_own on public.draw_checks
  for select to authenticated using (exists (
    select 1 from public.saved_tickets t where t.id = ticket_id and t.user_id = (select auth.uid())));
