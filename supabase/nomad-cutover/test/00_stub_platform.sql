-- 일회용 검사 DB(cutover_lottolab)에 Supabase 플랫폼 최소 형태를 만든다(supabase_admin으로 실행). 운영 DB에는 쓰지 않는다.
-- auth.users·auth.uid()·auth.jwt()·auth.role(), extensions 스키마(pgcrypto·pg_trgm·vector)·vault,
-- pg_cron 대역(cron.job·schedule·unschedule·alter_job): pg_cron은 cron.database_name(postgres) DB에만 설치되므로 같은 시그니처로 흉내 낸다.
create schema if not exists extensions;
grant usage on schema extensions to public;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists supabase_vault;
grant usage on schema vault to postgres, service_role;
grant all on all tables in schema vault to postgres, service_role;
grant execute on all functions in schema vault to postgres, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role, postgres;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  is_anonymous boolean not null default false,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, delete on auth.users to postgres, service_role;
grant references, trigger on auth.users to postgres;

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(auth.jwt() ->> 'role', '')
$$;
grant execute on function auth.jwt(), auth.uid(), auth.role() to public;

-- pg_cron 대역 (pg_cron 1.6 시그니처)
create schema cron;
grant usage on schema cron to postgres;
create table cron.job (
  jobid bigserial primary key,
  schedule text not null,
  command text not null,
  database text not null default current_database(),
  username text not null default current_user,
  active boolean not null default true,
  jobname text,
  unique (jobname, username)
);
grant all on cron.job to postgres;
grant usage on sequence cron.job_jobid_seq to postgres;
create function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname, username) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;
create function cron.unschedule(job_name text) returns boolean
language plpgsql as $$
begin
  delete from cron.job where jobname = job_name and username = current_user;
  if not found then
    raise exception 'could not find valid entry for job ''%''', job_name;
  end if;
  return true;
end;
$$;
create function cron.alter_job(job_id bigint, schedule text default null, command text default null,
  database text default null, username text default null, active boolean default null) returns void
language sql as $$
  update cron.job j set schedule = coalesce(alter_job.schedule, j.schedule),
    command = coalesce(alter_job.command, j.command), active = coalesce(alter_job.active, j.active)
  where j.jobid = job_id
$$;
grant execute on all functions in schema cron to postgres;

-- Supabase public 스키마 기본 권한(새 표는 anon·authenticated·service_role에 all, 마이그레이션이 revoke로 좁힌다)
alter database cutover_lottolab set search_path = "$user", public, extensions;
grant all on schema public to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
grant create on database cutover_lottolab to postgres;
