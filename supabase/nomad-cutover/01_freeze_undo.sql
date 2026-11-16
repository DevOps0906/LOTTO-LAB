-- LOTTO-LAB 이관 1단계 되돌리기: 01_freeze.sql이 기록한 권한·pg_cron 작업을 그대로 복원하고 nomad_cutover 스키마를 지운다.
-- 실행: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/nomad-cutover/01_freeze_undo.sql
-- 쓰기 재개(되돌릴 수 없는 지점) 전에만 쓴다. db push 뒤에 실행하면 같은 이름의 새 cron 작업(nomad_lottolab 대상)이
-- 옛 명령으로 덮인다 → 다시 이관할 때 02_copy.sql apply가 새 작업을 다시 등록한다.
\set ON_ERROR_STOP on
begin;

do $$
declare
  r record;
  v_diff bigint;
begin
  if to_regclass('nomad_cutover.frozen_grants') is null then
    raise exception 'freeze 기록이 없다(01_freeze.sql 미실행 또는 이미 되돌림)';
  end if;

  -- 1) 권한 복원
  for r in select * from nomad_cutover.frozen_grants loop
    execute format('grant %s%s on table %I.%I to %I%s',
      r.privilege_type,
      case when r.column_name is null then '' else format(' (%I)', r.column_name) end,
      r.schema_name, r.table_name, r.grantee,
      case when r.is_grantable then ' with grant option' else '' end);
  end loop;

  -- 확인: 현재 쓰기 권한 = 기록(양방향 차집합 0)
  with cur as (
    select l.schema_name, l.table_name, null::text as column_name, g.rolname as grantee, a.privilege_type, a.is_grantable
    from nomad_cutover.legacy_tables l
    join pg_catalog.pg_class c on c.oid = format('%I.%I', l.schema_name, l.table_name)::regclass
    cross join lateral pg_catalog.aclexplode(c.relacl) a
    join pg_catalog.pg_roles g on g.oid = a.grantee
    where a.privilege_type in ('INSERT', 'UPDATE', 'DELETE') and g.rolname in ('anon', 'authenticated', 'service_role')
    union all
    select l.schema_name, l.table_name, att.attname, g.rolname, a.privilege_type, a.is_grantable
    from nomad_cutover.legacy_tables l
    join pg_catalog.pg_attribute att on att.attrelid = format('%I.%I', l.schema_name, l.table_name)::regclass
    cross join lateral pg_catalog.aclexplode(att.attacl) a
    join pg_catalog.pg_roles g on g.oid = a.grantee
    where att.attnum > 0 and not att.attisdropped
      and a.privilege_type in ('INSERT', 'UPDATE') and g.rolname in ('anon', 'authenticated', 'service_role')
  )
  select count(*) into v_diff from (
    (select * from cur except select * from nomad_cutover.frozen_grants)
    union all
    (select * from nomad_cutover.frozen_grants except select * from cur)
  ) d;
  if v_diff <> 0 then
    raise exception '권한 복원 불일치 %건', v_diff;
  end if;

  -- 2) pg_cron 작업 복원(같은 이름은 덮어씀)
  if exists (select 1 from nomad_cutover.frozen_cron_jobs) then
    for r in select * from nomad_cutover.frozen_cron_jobs loop
      perform cron.schedule(r.jobname, r.schedule, r.command);
      if not r.active then
        perform cron.alter_job(job_id := (select j.jobid from cron.job j where j.jobname = r.jobname and j.username = current_user),
                               active := false);
      end if;
    end loop;
  end if;
end;
$$;

drop schema nomad_cutover cascade;

commit;
