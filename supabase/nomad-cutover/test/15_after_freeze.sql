-- 01_freeze 뒤: 옛 표에 사용자·서버 쓰기가 막히고 옛 cron 작업이 없다.
do $$
begin
  if exists (select 1 from cron.job) then
    raise exception 'freeze 뒤 옛 cron 작업이 남았다';
  end if;
  if (select count(*) from nomad_cutover.frozen_cron_jobs) <> 3 then
    raise exception '옛 cron 작업 3개가 기록되지 않았다';
  end if;
end;
$$;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
do $$
begin
  begin
    insert into public.generator_profiles (user_id, game, name, config)
    values ('a0000000-0000-4000-8000-00000000000a', 'lotto', 'freeze 뒤', '{}');
    raise exception 'freeze 뒤 authenticated insert가 통과했다';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.saved_tickets set purchase_status = 'purchased' where false;
    raise exception 'freeze 뒤 authenticated update가 통과했다';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.saved_tickets) <> 2 then
    raise exception 'freeze 뒤 본인 읽기는 유지되어야 한다';
  end if;
end;
$$;
rollback;

begin;
set local role service_role;
do $$
begin
  begin
    perform public.waitlist_rate_hit('k', 60, 5);
    raise exception 'freeze 뒤 service_role 레이트리밋 쓰기가 통과했다';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
