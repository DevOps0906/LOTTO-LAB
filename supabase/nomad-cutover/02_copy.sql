-- LOTTO-LAB 이관 2단계: 옛 public·private 표 → nomad_lottolab·nomad_lottolab_private 데이터 복사(user안). 한 트랜잭션.
-- 기본은 dry-run(끝에서 rollback). 적용: -v apply=1
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/nomad-cutover/02_copy.sql             # dry-run
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -v apply=1 -f supabase/nomad-cutover/02_copy.sql  # 적용
-- 전제: 01_freeze.sql 실행 · 새 migrations db push 완료.
-- 시작 검사(하나라도 걸리면 모두 모아 중단): freeze 미적용·옛 표 쓰기 권한 남음 / 대상 표가 비어 있지 않음(재실행 방지) /
--   익명 사용자(auth.users.is_anonymous) 소유 행. user안이라 개인 조직·플랜 대응은 해당 없음(옛 스키마에 플랜 없음).
-- 복사: set local session_replication_role = replica 로 대상 트리거(touch_updated_at·check_source·guard_transition)와 FK 트리거를 끄고
--   id·created_at·updated_at 원본 유지. 옛 updated_at null → created_at(fortune은 consented_at). deleted_at은 null.
-- 끝 검사: 표마다 행 수 + 전체 열 값(id·소유자 포함) 양방향 대조, FK 고아 행, 생성 번호 출처 소유 일치, 대상 표 목록 누락.
-- 시퀀스: 대상 표의 키는 모두 uuid·자연키라 setval 대상 없음.
\set ON_ERROR_STOP on
\if :{?apply}
\else
\set apply false
\endif

begin;
set local session_replication_role = replica;

-- ── 시작 검사 ─────────────────────────────────────────────────────────────
do $$
declare
  v_problems text[] := '{}';
  v_n bigint;
  r record;
begin
  if current_setting('session_replication_role') <> 'replica' then
    raise exception 'session_replication_role=replica가 적용되지 않았다(권한 확인)';
  end if;

  if to_regclass('nomad_cutover.legacy_tables') is null then
    v_problems := v_problems || '01_freeze.sql 미적용'::text;
  else
    for r in
      select l.schema_name, l.table_name, g.rolname, p.priv
      from nomad_cutover.legacy_tables l
      cross join (values ('anon'), ('authenticated'), ('service_role')) g(rolname)
      cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
      where case when p.priv = 'DELETE'
              then pg_catalog.has_table_privilege(g.rolname, format('%I.%I', l.schema_name, l.table_name), p.priv)
              else pg_catalog.has_any_column_privilege(g.rolname, format('%I.%I', l.schema_name, l.table_name), p.priv) end
    loop
      v_problems := v_problems || format('옛 표 쓰기 권한 남음 %s.%s %s %s', r.schema_name, r.table_name, r.rolname, r.priv);
    end loop;
  end if;

  for r in
    select n.nspname, c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('nomad_lottolab', 'nomad_lottolab_private') and c.relkind in ('r', 'p')
    order by 1, 2
  loop
    execute format('select count(*) from %I.%I', r.nspname, r.relname) into v_n;
    if v_n > 0 then
      v_problems := v_problems || format('대상 표 비어 있지 않음 %s.%s(%s행) — 재실행 거부', r.nspname, r.relname, v_n);
    end if;
  end loop;

  for r in
    select t.tbl, count(*) as n
    from (
      select 'generator_profiles' as tbl, user_id from public.generator_profiles
      union all select 'generated_batches', user_id from public.generated_batches
      union all select 'saved_tickets', user_id from public.saved_tickets
      union all select 'fortune_profiles', user_id from public.fortune_profiles
      union all select 'user_consents', user_id from public.user_consents
    ) t
    join auth.users u on u.id = t.user_id and u.is_anonymous
    group by t.tbl order by t.tbl
  loop
    v_problems := v_problems || format('익명 사용자 소유 행 %s %s건', r.tbl, r.n);
  end loop;

  if cardinality(v_problems) > 0 then
    raise exception '이관 중단: %', array_to_string(v_problems, ' / ');
  end if;
end;
$$;

-- ── 복사 (공개·수집 → 소유 없는 표 → 사용자 표, 부모 먼저) ─────────────────────
insert into nomad_lottolab.ingestion_runs (id, game, draw_no, source_url, fetched_at, payload_sha256, raw_payload, status,
  validation_errors, reverified_at, reverify_errors, reviewed_by, reviewed_at, review_note, created_at)
select id, game::text::nomad_lottolab.game_type, draw_no, source_url, fetched_at, payload_sha256, raw_payload, status,
  validation_errors, reverified_at, reverify_errors, reviewed_by, reviewed_at, review_note, created_at
from public.ingestion_runs;

insert into nomad_lottolab.draws_lotto (draw_no, draw_date, nums, bonus, prizes, source_url, ingestion_run_id, source_verified_at, created_at)
select draw_no, draw_date, nums, bonus, prizes, source_url, ingestion_run_id, source_verified_at, created_at
from public.draws_lotto;

insert into nomad_lottolab.draws_pension (draw_no, draw_date, group_no, digits, bonus_digits, prizes, source_url, ingestion_run_id, source_verified_at, created_at)
select draw_no, draw_date, group_no, digits, bonus_digits, prizes, source_url, ingestion_run_id, source_verified_at, created_at
from public.draws_pension;

insert into nomad_lottolab.statistics_cache (game, window_key, metric, payload, range_from, range_to, sample_size, source, updated_at, created_at)
select game::text::nomad_lottolab.game_type, window_key, metric, payload, range_from, range_to, sample_size, source, updated_at, created_at
from public.statistics_cache;

insert into nomad_lottolab.waitlist_signups (id, email, consent_marketing, age_confirmed, consented_at, created_at,
  confirmed_at, confirm_token_hash, confirm_expires_at, confirm_sends, confirm_window_start)
select id, email, consent_marketing, age_confirmed, consented_at, created_at,
  confirmed_at, confirm_token_hash, confirm_expires_at, confirm_sends, confirm_window_start
from public.waitlist_signups;

insert into nomad_lottolab_private.rate_limits (key, window_start, hits)
select key, window_start, hits from private.rate_limits;

insert into nomad_lottolab.generator_profiles (id, user_id, game, name, config, updated_at, deleted_at, created_at)
select id, user_id, game::text::nomad_lottolab.game_type, name, config, coalesce(updated_at, created_at), null, created_at
from public.generator_profiles;

insert into nomad_lottolab.generated_batches (id, user_id, game, round, strategy, method, engine_version, created_at)
select id, user_id, game::text::nomad_lottolab.game_type, round, strategy, method, engine_version, created_at
from public.generated_batches;

insert into nomad_lottolab.generated_numbers (id, batch_id, game, line_no, numbers, group_no, created_at)
select id, batch_id, game::text::nomad_lottolab.game_type, line_no, numbers, group_no, created_at
from public.generated_numbers;

insert into nomad_lottolab.saved_tickets (id, user_id, game, round, ticket_data, purchase_status, purchase_date, amount_won,
  source_number_id, idempotency_key, updated_at, deleted_at, created_at)
select id, user_id, game::text::nomad_lottolab.game_type, round, ticket_data, purchase_status, purchase_date, amount_won,
  source_number_id, idempotency_key, created_at, null, created_at
from public.saved_tickets;

insert into nomad_lottolab.draw_checks (id, ticket_id, game, draw_no, matched_rank, bonus_hit, checked_at, created_at)
select id, ticket_id, game::text::nomad_lottolab.game_type, draw_no, matched_rank, bonus_hit, checked_at, created_at
from public.draw_checks;

insert into nomad_lottolab.fortune_profiles (user_id, birth_date, calendar, is_leap_month, birth_hour, consented_at, updated_at, deleted_at)
select user_id, birth_date, calendar, is_leap_month, birth_hour, consented_at, coalesce(updated_at, consented_at), null
from public.fortune_profiles;

insert into nomad_lottolab.user_consents (id, user_id, terms_version, privacy_version, adult_confirmed, consented_at)
select id, user_id, terms_version, privacy_version, adult_confirmed, consented_at
from public.user_consents;

-- ── 끝 검사 ─────────────────────────────────────────────────────────────
create temp table cutover_compare (tbl text primary key, src text not null, dst text not null) on commit drop;
insert into cutover_compare values
  ('nomad_lottolab.ingestion_runs',
   'select id, game::text, draw_no, source_url, fetched_at, payload_sha256, raw_payload, status, validation_errors, reverified_at, reverify_errors, reviewed_by, reviewed_at, review_note, created_at from public.ingestion_runs',
   'select id, game::text, draw_no, source_url, fetched_at, payload_sha256, raw_payload, status, validation_errors, reverified_at, reverify_errors, reviewed_by, reviewed_at, review_note, created_at from nomad_lottolab.ingestion_runs'),
  ('nomad_lottolab.draws_lotto',
   'select draw_no, draw_date, nums, bonus, prizes, source_url, ingestion_run_id, source_verified_at, created_at from public.draws_lotto',
   'select draw_no, draw_date, nums, bonus, prizes, source_url, ingestion_run_id, source_verified_at, created_at from nomad_lottolab.draws_lotto'),
  ('nomad_lottolab.draws_pension',
   'select draw_no, draw_date, group_no, digits, bonus_digits, prizes, source_url, ingestion_run_id, source_verified_at, created_at from public.draws_pension',
   'select draw_no, draw_date, group_no, digits, bonus_digits, prizes, source_url, ingestion_run_id, source_verified_at, created_at from nomad_lottolab.draws_pension'),
  ('nomad_lottolab.statistics_cache',
   'select game::text, window_key, metric, payload, range_from, range_to, sample_size, source, updated_at, created_at from public.statistics_cache',
   'select game::text, window_key, metric, payload, range_from, range_to, sample_size, source, updated_at, created_at from nomad_lottolab.statistics_cache'),
  ('nomad_lottolab.waitlist_signups',
   'select id, email, email_norm, consent_marketing, age_confirmed, consented_at, created_at, confirmed_at, confirm_token_hash, confirm_expires_at, confirm_sends, confirm_window_start from public.waitlist_signups',
   'select id, email, email_norm, consent_marketing, age_confirmed, consented_at, created_at, confirmed_at, confirm_token_hash, confirm_expires_at, confirm_sends, confirm_window_start from nomad_lottolab.waitlist_signups'),
  ('nomad_lottolab_private.rate_limits',
   'select key, window_start, hits from private.rate_limits',
   'select key, window_start, hits from nomad_lottolab_private.rate_limits'),
  ('nomad_lottolab.generator_profiles',
   'select id, user_id, game::text, name, config, coalesce(updated_at, created_at), null::timestamptz, created_at from public.generator_profiles',
   'select id, user_id, game::text, name, config, updated_at, deleted_at, created_at from nomad_lottolab.generator_profiles'),
  ('nomad_lottolab.generated_batches',
   'select id, user_id, game::text, round, strategy, method, engine_version, created_at from public.generated_batches',
   'select id, user_id, game::text, round, strategy, method, engine_version, created_at from nomad_lottolab.generated_batches'),
  ('nomad_lottolab.generated_numbers',
   'select id, batch_id, game::text, line_no, numbers, group_no, created_at from public.generated_numbers',
   'select id, batch_id, game::text, line_no, numbers, group_no, created_at from nomad_lottolab.generated_numbers'),
  ('nomad_lottolab.saved_tickets',
   'select id, user_id, game::text, round, ticket_data, purchase_status, purchase_date, amount_won, source_number_id, idempotency_key, created_at, null::timestamptz, created_at from public.saved_tickets',
   'select id, user_id, game::text, round, ticket_data, purchase_status, purchase_date, amount_won, source_number_id, idempotency_key, updated_at, deleted_at, created_at from nomad_lottolab.saved_tickets'),
  ('nomad_lottolab.draw_checks',
   'select id, ticket_id, game::text, draw_no, matched_rank, bonus_hit, checked_at, created_at from public.draw_checks',
   'select id, ticket_id, game::text, draw_no, matched_rank, bonus_hit, checked_at, created_at from nomad_lottolab.draw_checks'),
  ('nomad_lottolab.fortune_profiles',
   'select user_id, birth_date, calendar, is_leap_month, birth_hour, consented_at, coalesce(updated_at, consented_at), null::timestamptz from public.fortune_profiles',
   'select user_id, birth_date, calendar, is_leap_month, birth_hour, consented_at, updated_at, deleted_at from nomad_lottolab.fortune_profiles'),
  ('nomad_lottolab.user_consents',
   'select id, user_id, terms_version, privacy_version, adult_confirmed, consented_at from public.user_consents',
   'select id, user_id, terms_version, privacy_version, adult_confirmed, consented_at from nomad_lottolab.user_consents');

do $$
declare
  -- 옛 원본이 없는 새 표(앱 신규, 비어 있어야 함)
  v_new_only constant text[] := array['nomad_lottolab.push_devices', 'nomad_lottolab.subscription_accounts'];
  v_problems text[] := '{}';
  v_src bigint; v_dst bigint; v_diff bigint; v_n bigint;
  r record;
  v_cond text; v_join text;
begin
  -- 대상 표 목록 누락(새 표가 생겼는데 이 스크립트가 모름)
  for r in
    select format('%I.%I', n.nspname, c.relname) as tbl
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('nomad_lottolab', 'nomad_lottolab_private') and c.relkind in ('r', 'p')
      and format('%I.%I', n.nspname, c.relname) not in (select tbl from cutover_compare)
      and format('%I.%I', n.nspname, c.relname) <> all (v_new_only)
  loop
    v_problems := v_problems || format('대조 목록에 없는 대상 표 %s', r.tbl);
  end loop;
  foreach v_cond in array v_new_only loop
    execute format('select count(*) from %s', v_cond) into v_n;
    if v_n <> 0 then v_problems := v_problems || format('%s는 비어 있어야 함(%s행)', v_cond, v_n); end if;
  end loop;

  -- 행 수 + 값 대조
  for r in select * from cutover_compare order by tbl loop
    execute format('select count(*) from (%s) s', r.src) into v_src;
    execute format('select count(*) from (%s) d', r.dst) into v_dst;
    execute format('select count(*) from ((%1$s except all %2$s) union all (%2$s except all %1$s)) x', r.src, r.dst) into v_diff;
    raise notice '% 원본 % / 대상 % / 불일치 %', r.tbl, v_src, v_dst, v_diff;
    if v_src <> v_dst or v_diff <> 0 then
      v_problems := v_problems || format('%s 원본 %s 대상 %s 불일치 %s', r.tbl, v_src, v_dst, v_diff);
    end if;
  end loop;

  -- FK 고아 행(replica 모드에서 FK가 검사되지 않았으므로 모든 FK를 직접 검사, 복합 FK 포함)
  for r in
    select con.conname, con.conrelid::regclass::text as child, con.confrelid::regclass::text as parent,
      array(select quote_ident(a.attname) from unnest(con.conkey) with ordinality k(n, o)
            join pg_catalog.pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.o) as ccols,
      array(select quote_ident(a.attname) from unnest(con.confkey) with ordinality k(n, o)
            join pg_catalog.pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.o) as pcols
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_namespace n on n.oid = con.connamespace
    where con.contype = 'f' and n.nspname in ('nomad_lottolab', 'nomad_lottolab_private')
  loop
    select string_agg(format('c.%s is not null', x), ' and ') into v_cond from unnest(r.ccols) x;
    select string_agg(format('p.%s = c.%s', r.pcols[i], r.ccols[i]), ' and ') into v_join
      from generate_subscripts(r.ccols, 1) i;
    execute format('select count(*) from %s c where %s and not exists (select 1 from %s p where %s)',
                   r.child, v_cond, r.parent, v_join) into v_n;
    if v_n <> 0 then
      v_problems := v_problems || format('FK 고아 %s %s건', r.conname, v_n);
    end if;
  end loop;

  -- 저장 티켓의 출처 번호는 같은 사용자의 생성 번호(check_source 트리거를 껐으므로 직접 검사)
  select count(*) into v_n
  from nomad_lottolab.saved_tickets t
  join nomad_lottolab.generated_numbers gn on gn.id = t.source_number_id
  join nomad_lottolab.generated_batches b on b.id = gn.batch_id
  where b.user_id <> t.user_id;
  if v_n <> 0 then
    v_problems := v_problems || format('saved_tickets 출처 번호 소유 불일치 %s건', v_n);
  end if;

  if cardinality(v_problems) > 0 then
    raise exception '이관 검사 실패: %', array_to_string(v_problems, ' / ');
  end if;
end;
$$;

-- pg_cron 보관 기간 작업을 새 표 대상으로 (다시) 등록: 01_freeze_undo 뒤 재이관하면 db push가 다시 등록하지 않으므로.
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron 없음: cron 작업 등록 건너뜀';
    return;
  end if;
  perform cron.schedule('waitlist_purge_6m', '17 3 * * *',
    $c$delete from nomad_lottolab.waitlist_signups where created_at < now() - interval '6 months'$c$);
  perform cron.schedule('rate_limits_purge', '27 3 * * *',
    $c$delete from nomad_lottolab_private.rate_limits where window_start < now() - interval '1 day'$c$);
  perform cron.schedule('waitlist_purge_unconfirmed', '47 * * * *',
    $c$delete from nomad_lottolab.waitlist_signups where confirmed_at is null and confirm_expires_at < now()$c$);
end;
$$;

\if :apply
commit;
\echo '02_copy: 적용(commit) 완료'
\else
rollback;
\echo '02_copy: dry-run 통과(rollback). 적용하려면 -v apply=1'
\endif
