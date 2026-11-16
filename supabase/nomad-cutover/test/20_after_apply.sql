-- 02 apply 직후 같은 세션에서 실행: set local 해제 · 원본 값 유지 · RLS 격리 · cron 대상 · 트리거 동작 확인.
do $$
begin
  if current_setting('session_replication_role') <> 'origin' then
    raise exception 'set local이 아니다: commit 뒤에도 session_replication_role=%', current_setting('session_replication_role');
  end if;
  -- 원본 값 유지(updated_at null → created_at / consented_at, 있으면 그대로)
  if (select updated_at from nomad_lottolab.generator_profiles where id = 'e1000000-0000-4000-8000-000000000001')
     is distinct from '2026-09-01 10:00+09'::timestamptz then
    raise exception 'generator_profiles updated_at(null→created_at) 불일치';
  end if;
  if (select updated_at from nomad_lottolab.generator_profiles where id = 'e1000000-0000-4000-8000-000000000002')
     is distinct from '2026-10-01 10:00+09'::timestamptz then
    raise exception 'generator_profiles updated_at 원본 유지 실패(트리거가 돌았나)';
  end if;
  if (select updated_at from nomad_lottolab.fortune_profiles where user_id = 'a0000000-0000-4000-8000-00000000000a')
     is distinct from '2026-10-10 10:00+09'::timestamptz then
    raise exception 'fortune_profiles updated_at(null→consented_at) 불일치';
  end if;
  if (select (amount_won, idempotency_key, source_number_id, created_at)::text from nomad_lottolab.saved_tickets
      where id = 'f3000000-0000-4000-8000-000000000001')
     is distinct from (5000::bigint, '9a000000-0000-4000-8000-000000000001'::uuid,
                       'f2000000-0000-4000-8000-000000000001'::uuid, '2026-11-05 12:00+09'::timestamptz)::text then
    raise exception 'saved_tickets 금액·멱등 키·출처·created_at 불일치';
  end if;
  if (select count(*) from nomad_lottolab.saved_tickets where idempotency_key = '9a000000-0000-4000-8000-000000000001') <> 2 then
    raise exception '사용자별 멱등 키가 유지되지 않았다';
  end if;
  if (select email_norm from nomad_lottolab.waitlist_signups where id = 'c1000000-0000-4000-8000-000000000001') <> 'wait-one@example.test' then
    raise exception 'waitlist email_norm 불일치';
  end if;
  -- cron 보관 작업이 새 표를 가리킨다
  if (select count(*) from cron.job where command like '%nomad_lottolab%') <> 3
     or exists (select 1 from cron.job where command not like '%nomad_lottolab%') then
    raise exception 'cron 작업이 새 표 대상 3개가 아니다';
  end if;
end;
$$;

-- RLS 격리: A는 자기 행만, B 행은 못 본다
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
do $$
declare
  v_got text;
begin
  select format('%s/%s/%s/%s/%s/%s/%s',
    (select count(*) from nomad_lottolab.generator_profiles), (select count(*) from nomad_lottolab.generated_batches),
    (select count(*) from nomad_lottolab.generated_numbers), (select count(*) from nomad_lottolab.saved_tickets),
    (select count(*) from nomad_lottolab.draw_checks), (select count(*) from nomad_lottolab.fortune_profiles),
    (select count(*) from nomad_lottolab.user_consents)) into v_got;
  if v_got <> '2/2/3/2/2/1/2' then
    raise exception 'A가 보는 행 수 % (기대 2/2/3/2/2/1/2)', v_got;
  end if;
  if exists (select 1 from nomad_lottolab.saved_tickets where user_id <> 'a0000000-0000-4000-8000-00000000000a')
     or exists (select 1 from nomad_lottolab.generated_numbers where batch_id = 'f1000000-0000-4000-8000-000000000003')
     or exists (select 1 from nomad_lottolab.draw_checks where ticket_id = 'f3000000-0000-4000-8000-000000000003') then
    raise exception 'A가 B 행을 본다';
  end if;
end;
$$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}';
do $$
declare
  v_got text;
begin
  select format('%s/%s/%s/%s/%s/%s/%s',
    (select count(*) from nomad_lottolab.generator_profiles), (select count(*) from nomad_lottolab.generated_batches),
    (select count(*) from nomad_lottolab.generated_numbers), (select count(*) from nomad_lottolab.saved_tickets),
    (select count(*) from nomad_lottolab.draw_checks), (select count(*) from nomad_lottolab.fortune_profiles),
    (select count(*) from nomad_lottolab.user_consents)) into v_got;
  if v_got <> '1/1/1/1/1/1/1' then
    raise exception 'B가 보는 행 수 % (기대 1/1/1/1/1/1/1)', v_got;
  end if;
end;
$$;
rollback;

begin;
set local role anon;
do $$
begin
  if (select count(*) from nomad_lottolab.draws_lotto) <> 2 or (select count(*) from nomad_lottolab.draws_pension) <> 2
     or (select count(*) from nomad_lottolab.statistics_cache) <> 2 then
    raise exception 'anon 공개 읽기 행 수 불일치';
  end if;
  if has_table_privilege('anon', 'nomad_lottolab.saved_tickets', 'select') then
    raise exception 'anon이 saved_tickets를 읽을 수 있다';
  end if;
end;
$$;
rollback;

-- set local session_replication_role = replica가 실제로 대상 트리거를 끄는지(postgres 권한): 끄면 통과, 안 끄면 23503
begin;
do $$
begin
  begin
    insert into nomad_lottolab.saved_tickets (user_id, game, round, ticket_data, purchase_status, source_number_id, idempotency_key)
    values ('b0000000-0000-4000-8000-00000000000b', 'lotto', 1100, '{"nums":[3,11,19,27,35,44]}', 'favorite',
            'f2000000-0000-4000-8000-000000000001', gen_random_uuid());
    raise exception 'check_source 트리거가 동작하지 않는다(origin)';
  exception when foreign_key_violation then null;
  end;
end;
$$;
rollback;
begin;
set local session_replication_role = replica;
insert into nomad_lottolab.saved_tickets (user_id, game, round, ticket_data, purchase_status, source_number_id, idempotency_key)
values ('b0000000-0000-4000-8000-00000000000b', 'lotto', 1100, '{"nums":[3,11,19,27,35,44]}', 'favorite',
        'f2000000-0000-4000-8000-000000000001', gen_random_uuid());
rollback;
do $$
begin
  if current_setting('session_replication_role') <> 'origin' then
    raise exception 'rollback 뒤 session_replication_role이 되돌아오지 않았다';
  end if;
end;
$$;
