-- task-003 사전알림(A-15): waitlist_signups + IP 레이트리밋 카운터 + 보관 기간 삭제 작업
-- 근거: docs/04_API.md#1 A-15·#4·#5, docs/05_DATA_MODEL.md#2 waitlist_signups

create extension if not exists pg_cron with schema pg_catalog;

-- 1) 사전알림 신청 ----------------------------------------------------------
create table public.waitlist_signups (
  id                uuid        primary key default gen_random_uuid(),
  email             text        not null,
  email_norm        text        generated always as (lower(trim(email))) stored,
  consent_marketing boolean     not null,
  age_confirmed     boolean     not null,
  consented_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  constraint waitlist_signups_email_len_chk check (length(email) <= 254),
  constraint waitlist_signups_consent_marketing_chk check (consent_marketing = true),
  constraint waitlist_signups_age_confirmed_chk check (age_confirmed = true),
  constraint waitlist_signups_email_norm_key unique (email_norm)
);

comment on table public.waitlist_signups is
  '사전알림 신청(A-15). 이메일·마케팅 동의·만 19세 확인. 쓰기는 EF(service_role)만, 6개월 후 pg_cron 삭제.';

create index waitlist_signups_created_at_idx on public.waitlist_signups (created_at);

-- RLS 활성 + 정책 없음 = anon·authenticated 전면 거부. 쓰기는 EF의 service_role만.
alter table public.waitlist_signups enable row level security;
revoke all on table public.waitlist_signups from anon, authenticated, public;
grant select, insert, update, delete on table public.waitlist_signups to service_role;

-- 2) IP 레이트리밋 카운터 (private 스키마, service_role만) --------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table private.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  hits         int         not null default 0,
  primary key (key, window_start)
);

comment on table private.rate_limits is
  '고정 창 레이트리밋 카운터. key = sha256(RATE_SALT || 정규화 IP), 원문 IP 저장 안 함. 1일 지난 창은 pg_cron 삭제.';

create index rate_limits_window_start_idx on private.rate_limits (window_start);

alter table private.rate_limits enable row level security;
revoke all on table private.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.rate_limits to service_role;

-- 창 안에서 hits를 원자적으로 1 올리고, 한도 이내면 true.
create or replace function public.waitlist_rate_hit(p_key text, p_window_sec int, p_max int)
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

  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  return v_hits <= p_max;
end;
$$;

comment on function public.waitlist_rate_hit(text, int, int) is
  'A-15 IP 레이트리밋: (key, 창) 카운터를 원자 증가하고 한도 이내 여부를 돌려준다. service_role 전용.';

revoke execute on function public.waitlist_rate_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.waitlist_rate_hit(text, int, int) to service_role;

-- 3) 보관 기간 삭제 (pg_cron, UTC) ------------------------------------------
select cron.schedule(
  'waitlist_purge_6m',
  '17 3 * * *',
  $$delete from public.waitlist_signups where created_at < now() - interval '6 months'$$
);

select cron.schedule(
  'rate_limits_purge',
  '27 3 * * *',
  $$delete from private.rate_limits where window_start < now() - interval '1 day'$$
);
