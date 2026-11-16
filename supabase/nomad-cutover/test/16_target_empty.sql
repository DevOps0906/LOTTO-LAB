-- 02 dry-run 뒤: 대상 표가 모두 비어 있다(변경 없음).
do $$
declare
  r record;
  v_n bigint;
begin
  for r in
    select n.nspname, c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('nomad_lottolab', 'nomad_lottolab_private') and c.relkind = 'r'
  loop
    execute format('select count(*) from %I.%I', r.nspname, r.relname) into v_n;
    if v_n <> 0 then
      raise exception 'dry-run 뒤 %.%에 %행이 남았다', r.nspname, r.relname, v_n;
    end if;
  end loop;
  if exists (select 1 from cron.job) then
    raise exception 'dry-run 뒤 cron 작업이 생겼다';
  end if;
end;
$$;
