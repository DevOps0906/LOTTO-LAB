-- LOTTO-LAB 이관 1단계: 옛 표 쓰기 중지(freeze). 사람이 1회 실행한다(마이그레이션 아님).
-- 실행: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/nomad-cutover/01_freeze.sql
-- 하는 일:
--   1) 옛 표(public 12개 + private.rate_limits)의 insert·update·delete(열 단위 포함)를 anon·authenticated·service_role에서 revoke.
--      revoke 전에 권한을 nomad_cutover.frozen_grants에 기록한다(01_freeze_undo.sql이 그대로 되돌림).
--   2) 옛 pg_cron 작업(waitlist_purge_6m · rate_limits_purge · waitlist_purge_unconfirmed 중 명령이 nomad_lottolab을 가리키지 않는 것)을
--      nomad_cutover.frozen_cron_jobs에 기록하고 unschedule.
--   3) 옛 auth.users 트리거: LOTTO-LAB 옛 스키마에는 없다(아래에서 있으면 중단해 사람이 확인).
-- 표·함수·데이터는 남긴다. 다시 실행하면 거부한다(이미 freeze 상태).
\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regnamespace('nomad_cutover') is not null then
    raise exception '이미 freeze 상태다(nomad_cutover 스키마 있음). 되돌리려면 01_freeze_undo.sql';
  end if;
  if exists (
    select 1 from pg_catalog.pg_trigger t
    join pg_catalog.pg_proc p on p.oid = t.tgfoid
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal and n.nspname in ('public', 'private')
  ) then
    raise exception 'auth.users에 옛 public·private 함수 트리거가 있다. LOTTO-LAB 옛 스키마에는 없어야 하므로 사람이 확인한다';
  end if;
end;
$$;

create schema nomad_cutover;
revoke all on schema nomad_cutover from public, anon, authenticated, service_role;
comment on schema nomad_cutover is 'LOTTO-LAB 데이터 이관 상태(01_freeze 기록). 01_freeze_undo.sql이 지운다. API 노출 금지.';

create table nomad_cutover.legacy_tables (
  schema_name text not null,
  table_name  text not null,
  primary key (schema_name, table_name)
);
insert into nomad_cutover.legacy_tables values
  ('public', 'waitlist_signups'), ('public', 'ingestion_runs'), ('public', 'draws_lotto'), ('public', 'draws_pension'),
  ('public', 'statistics_cache'), ('public', 'generator_profiles'), ('public', 'generated_batches'),
  ('public', 'generated_numbers'), ('public', 'saved_tickets'), ('public', 'draw_checks'),
  ('public', 'fortune_profiles'), ('public', 'user_consents'), ('private', 'rate_limits');

create table nomad_cutover.frozen_grants (
  schema_name    text    not null,
  table_name     text    not null,
  column_name    text,             -- null = 표 단위 권한
  grantee        text    not null,
  privilege_type text    not null,
  is_grantable   boolean not null
);
create table nomad_cutover.frozen_cron_jobs (
  jobname  text    primary key,
  schedule text    not null,
  command  text    not null,
  active   boolean not null
);
alter table nomad_cutover.legacy_tables enable row level security;
alter table nomad_cutover.frozen_grants enable row level security;
alter table nomad_cutover.frozen_cron_jobs enable row level security;
revoke all on all tables in schema nomad_cutover from public, anon, authenticated, service_role;

-- 1) 쓰기 권한 기록 → revoke
do $$
declare
  r record;
begin
  for r in select * from nomad_cutover.legacy_tables loop
    if to_regclass(format('%I.%I', r.schema_name, r.table_name)) is null then
      raise exception '옛 표 %.%가 없다', r.schema_name, r.table_name;
    end if;
  end loop;

  insert into nomad_cutover.frozen_grants
  select l.schema_name, l.table_name, null, g.rolname, a.privilege_type, a.is_grantable
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
    and a.privilege_type in ('INSERT', 'UPDATE') and g.rolname in ('anon', 'authenticated', 'service_role');

  for r in select * from nomad_cutover.legacy_tables loop
    -- 표 단위 revoke는 같은 권한의 열 단위 권한도 함께 회수한다
    execute format('revoke insert, update, delete on table %I.%I from anon, authenticated, service_role',
                   r.schema_name, r.table_name);
  end loop;

  -- 확인: 남은 쓰기 권한이 있으면 중단(다른 grantor가 준 권한 등)
  for r in
    select l.schema_name, l.table_name, g.rolname, p.priv
    from nomad_cutover.legacy_tables l
    cross join (values ('anon'), ('authenticated'), ('service_role')) g(rolname)
    cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
    where case when p.priv = 'DELETE'
            then pg_catalog.has_table_privilege(g.rolname, format('%I.%I', l.schema_name, l.table_name), p.priv)
            else pg_catalog.has_any_column_privilege(g.rolname, format('%I.%I', l.schema_name, l.table_name), p.priv) end
  loop
    raise exception '쓰기 권한이 남았다: %.% % %', r.schema_name, r.table_name, r.rolname, r.priv;
  end loop;
end;
$$;

-- 2) 옛 pg_cron 작업 기록 → unschedule (pg_cron이 없으면 건너뜀)
do $$
declare
  r record;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron 없음: cron 작업 정리 건너뜀';
    return;
  end if;
  insert into nomad_cutover.frozen_cron_jobs
  select j.jobname, j.schedule, j.command, j.active
  from cron.job j
  where j.jobname in ('waitlist_purge_6m', 'rate_limits_purge', 'waitlist_purge_unconfirmed')
    and j.command not like '%nomad_lottolab%';
  for r in select jobname from nomad_cutover.frozen_cron_jobs loop
    perform cron.unschedule(r.jobname);
  end loop;
end;
$$;

select 'frozen_grants' as recorded, count(*) from nomad_cutover.frozen_grants
union all select 'frozen_cron_jobs', count(*) from nomad_cutover.frozen_cron_jobs;

commit;
