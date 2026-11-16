-- task-003b 사전알림 이메일 이중 확인(A-15 확인 메일 요청 · A-19 확인)
-- 근거: docs/04_API.md#1 A-15·A-19, docs/05_DATA_MODEL.md#2 waitlist_signups(이중 확인)
-- 출시 알림(task-044)은 confirmed_at IS NOT NULL 인 행에만 보낸다.

-- 1) 확인 상태 컬럼 ------------------------------------------------------------
alter table public.waitlist_signups
  add column confirmed_at         timestamptz,          -- NULL = 미확인
  add column confirm_token_hash   text,                 -- sha256(토큰) hex, 원문 저장 안 함
  add column confirm_expires_at   timestamptz,          -- 마지막 발송 후 24시간
  add column confirm_sends        int not null default 0,
  add column confirm_window_start timestamptz,          -- 이메일별 발송 한도 창 시작
  add constraint waitlist_signups_confirm_token_hash_chk
    check (confirm_token_hash is null or confirm_token_hash ~ '^[0-9a-f]{64}$');

comment on column public.waitlist_signups.confirmed_at is
  '이메일 확인 시각(NULL=미확인). 출시 알림은 확인된 행만. 확인 시 consented_at도 같은 시각으로 한 번 확정.';

-- 이 기능 이전의 행은 확인 메일을 받은 적이 없으므로 즉시 만료 → 다음 purge에서 삭제
update public.waitlist_signups set confirm_expires_at = now() where confirmed_at is null;

create index waitlist_signups_confirm_token_hash_idx
  on public.waitlist_signups (confirm_token_hash) where confirm_token_hash is not null;
create index waitlist_signups_unconfirmed_expires_idx
  on public.waitlist_signups (confirm_expires_at) where confirmed_at is null;

-- 2) 확인 메일 요청 (A-15) ------------------------------------------------------
-- 한 문장으로 원자 처리: 신규면 INSERT, 기존 미확인이면 창 리셋·카운트·토큰 해시·만료 갱신.
-- 새 토큰은 토큰이 없거나 만료된 뒤에만 발급하고, 이메일별 창(p_window_sec) 안 p_max_sends 통 한도를 지킨다.
-- 확인된 행·미만료 링크가 있는 행·한도 초과 행은 갱신하지 않는다. true = 확인 메일을 보낼 것.
-- 창 경계: now() = window_start + p_window_sec 시점부터 새 창으로 본다.
create or replace function public.waitlist_request_confirm(
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

  insert into public.waitlist_signups as w
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
    -- 미만료 링크가 있으면 덮어쓰지 않는다(제3자가 피해자 링크 무효화·한도 소진 불가)
    and (w.confirm_expires_at is null or w.confirm_expires_at <= now())
    and (w.confirm_window_start is null
         or w.confirm_window_start <= now() - make_interval(secs => p_window_sec)
         or w.confirm_sends < p_max_sends)
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

comment on function public.waitlist_request_confirm(text, text, int, int, int) is
  'A-15: 미확인 행만 확인 토큰 해시·만료·발송 카운트를 원자 갱신하고 메일 발송 여부를 돌려준다. service_role 전용.';

revoke execute on function public.waitlist_request_confirm(text, text, int, int, int) from public, anon, authenticated;
grant execute on function public.waitlist_request_confirm(text, text, int, int, int) to service_role;

-- 3) 확인 (A-19) -------------------------------------------------------------------
-- 미만료 토큰 해시 일치 → 미확인이면 confirmed_at·consented_at 확정. 이미 확정된 같은 토큰도 true.
create or replace function public.waitlist_confirm(p_token_hash text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  update public.waitlist_signups
     set confirmed_at = now(), consented_at = now()
   where confirm_token_hash = p_token_hash
     and confirm_expires_at > now()
     and confirmed_at is null;
  if found then
    return true;
  end if;

  return exists (
    select 1 from public.waitlist_signups
     where confirm_token_hash = p_token_hash
       and confirm_expires_at > now()
       and confirmed_at is not null
  );
end;
$$;

comment on function public.waitlist_confirm(text) is
  'A-19: 확인 토큰 해시로 이메일 확인을 한 번 확정한다(재제출도 만료 전이면 true). service_role 전용.';

revoke execute on function public.waitlist_confirm(text) from public, anon, authenticated;
grant execute on function public.waitlist_confirm(text) to service_role;

-- 4) 미확인 만료 행 삭제 (pg_cron, UTC, 매시 47분) ------------------------------------
select cron.schedule(
  'waitlist_purge_unconfirmed',
  '47 * * * *',
  $$delete from public.waitlist_signups where confirmed_at is null and confirm_expires_at < now()$$
);
