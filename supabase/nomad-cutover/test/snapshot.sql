-- 옛 표 쓰기 권한(표·열 단위)과 cron 작업을 정렬된 텍스트로 출력한다(01 전후·01_undo 뒤 비교용).
select format('grant %s.%s %s %s %s %s', n.nspname, c.relname, '-', g.rolname, a.privilege_type, a.is_grantable)
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
cross join lateral pg_catalog.aclexplode(c.relacl) a
join pg_catalog.pg_roles g on g.oid = a.grantee
where (n.nspname = 'public' or (n.nspname = 'private' and c.relname = 'rate_limits')) and c.relkind = 'r'
  and g.rolname in ('anon', 'authenticated', 'service_role')
union all
select format('grant %s.%s %s %s %s %s', n.nspname, c.relname, att.attname, g.rolname, a.privilege_type, a.is_grantable)
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_attribute att on att.attrelid = c.oid and att.attnum > 0 and not att.attisdropped
cross join lateral pg_catalog.aclexplode(att.attacl) a
join pg_catalog.pg_roles g on g.oid = a.grantee
where (n.nspname = 'public' or (n.nspname = 'private' and c.relname = 'rate_limits')) and c.relkind = 'r'
  and g.rolname in ('anon', 'authenticated', 'service_role')
union all
select format('cron %s|%s|%s|%s', jobname, schedule, command, active) from cron.job
order by 1;
