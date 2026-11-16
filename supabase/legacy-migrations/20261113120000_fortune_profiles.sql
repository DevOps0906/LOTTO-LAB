-- task-040 사주 프로필: fortune_profiles (P1, ADR-0005)
-- 근거: docs/05_DATA_MODEL.md#2·#3, docs/04_API.md#1 A-17·5절, tasks/task-040.md 팀장 결정 ①~⑦
-- 개인정보(생년월일·태어난 시진) — 본인 행만, 계정 삭제 시 CASCADE 파기. 성별 등 다른 항목 없음.
-- 권한: user_data와 같은 방식(모두 회수 후 필요한 것만 GRANT, RLS 조건은 (select auth.uid())).

create table public.fortune_profiles (
  user_id       uuid        primary key references auth.users (id) on delete cascade,   -- 1인 1행
  birth_date    text        not null,   -- 'YYYY-MM-DD'. 음력 30일 허용 위해 date가 아닌 text(결정 ①)
  calendar      text        not null,
  is_leap_month boolean     not null default false,
  birth_hour    text,                   -- 12시진 ID, NULL = 모름(결정 ③)
  consented_at  timestamptz not null default now(),
  updated_at    timestamptz,
  constraint fortune_profiles_calendar_chk check (calendar in ('solar', 'lunar')),
  -- 형식·날짜 유효성: 정규식 확인 뒤에만 판정(CASE 순서 보장). 형변환 예외 대신 pg_input_is_valid로 false.
  constraint fortune_profiles_birth_date_chk check (
    case
      when birth_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then false
      when calendar = 'solar' then pg_input_is_valid(birth_date, 'date')
      when calendar = 'lunar' then substr(birth_date, 6, 2) between '01' and '12'
                               and substr(birth_date, 9, 2) between '01' and '30'
      else false
    end
  ),
  -- 범위: 1900-01-01 ~ KST 오늘(엔진 KST와 일치, 결정 ②). DateStyle 영향 없게 to_char.
  -- now()는 비불변이지만 과거 날짜는 계속 유효하므로 복원 시 재검증해도 기존 행이 실패하지 않는다.
  constraint fortune_profiles_birth_date_range_chk check (
    birth_date >= '1900-01-01'
    and birth_date <= to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')
  ),
  constraint fortune_profiles_leap_chk check (not is_leap_month or calendar = 'lunar'),   -- 결정 ④
  constraint fortune_profiles_birth_hour_chk check (
    birth_hour in ('ja', 'chuk', 'in', 'myo', 'jin', 'sa', 'o', 'mi', 'sin', 'yu', 'sul', 'hae')
  )
);

comment on table public.fortune_profiles is
  '사주 번호용 생년월일 프로필(P1, ADR-0005). 1인 1행, 본인만 SELECT/INSERT/UPDATE/DELETE, 계정 삭제 시 CASCADE 파기. 서버 사주 계산 없음.';

-- 정책 열 user_id는 PK 인덱스로 처리(별도 인덱스 없음).

alter table public.fortune_profiles enable row level security;
revoke all on table public.fortune_profiles from anon, authenticated, public, service_role;
grant select, delete on table public.fortune_profiles to authenticated;
-- consented_at·updated_at은 서버 값만(DEFAULT·트리거). user_id UPDATE 권한은 PostgREST upsert(SET에 모든 열)용 —
-- 다른 uid로 변경은 RLS WITH CHECK가 42501로 막는다(결정 ⑤ 갱신).
grant insert (user_id, birth_date, calendar, is_leap_month, birth_hour) on table public.fortune_profiles to authenticated;
grant update (user_id, birth_date, calendar, is_leap_month, birth_hour) on table public.fortune_profiles to authenticated;

create policy fortune_profiles_select_own on public.fortune_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy fortune_profiles_insert_own on public.fortune_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy fortune_profiles_update_own on public.fortune_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy fortune_profiles_delete_own on public.fortune_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

-- updated_at: UPDATE 때 서버 시각으로 덮어쓴다(클라이언트 값 무시).
create function private.fortune_profiles_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function private.fortune_profiles_set_updated_at() is
  'fortune_profiles BEFORE UPDATE: updated_at = now().';

create trigger fortune_profiles_set_updated_at
  before update on public.fortune_profiles
  for each row execute function private.fortune_profiles_set_updated_at();

revoke all on function private.fortune_profiles_set_updated_at() from public, anon, authenticated;
