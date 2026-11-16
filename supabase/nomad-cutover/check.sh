#!/usr/bin/env bash
# LOTTO-LAB 이관 스크립트 검사(일회용 로컬 DB). 운영 DB에 접속하지 않는다.
# 사용: bash supabase/nomad-cutover/check.sh
#   컨테이너: CUTOVER_CONTAINER(기본 supabase_db_nomad-supabase-module) 안의 cutover_lottolab DB만 만들고 지운다.
# 순서: 옛 legacy-migrations 적용 → 합성 seed → 새 migrations 적용 → 01 freeze → 02 dry-run(변경 없음) → 02 apply
#   → 값·RLS·set local 확인 → 02 재실행 거부 → 익명 행 중단 → 01_undo 정확 복원(권한·cron 스냅숏 비교).
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
S="$(cd "$D/.." && pwd)"
C="${CUTOVER_CONTAINER:-supabase_db_nomad-supabase-module}"
DB=cutover_lottolab
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

admin() { docker exec -i "$C" psql -U supabase_admin -v ON_ERROR_STOP=1 -q "$@"; }
run() { docker exec -i "$C" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q "$@"; }
runf() { local f="$1"; shift; run "$@" < "$f"; }
step() { echo "== $*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
expect_fail() {  # expect_fail <메시지 일부> <파일> [psql 인자...]
  local pat="$1" f="$2"; shift 2
  local out
  if out=$(runf "$f" "$@" 2>&1); then fail "실패해야 하는데 통과: $f $*"; fi
  grep -qF -- "$pat" <<<"$out" || { echo "$out" >&2; fail "기대 메시지 없음: $pat"; }
}

step "일회용 DB $DB 재생성"
admin -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
admin -d "$DB" < "$D/test/00_stub_platform.sql"

step "옛 legacy-migrations 적용"
for f in "$S"/legacy-migrations/*.sql; do
  # pg_cron은 postgres DB에만 설치되므로 확장 생성 줄만 빼고 cron 대역(00_stub)으로 실행
  sed '/create extension if not exists pg_cron/d' "$f" | run -1 > /dev/null
done

step "합성 seed"
runf "$D/test/10_seed_legacy.sql" > /dev/null

step "새 migrations 적용"
M="${CUTOVER_MIGRATIONS_DIR:-$S/migrations}"   # 검증용 덮어쓰기만(기본은 레포 migrations)
for f in "$M"/*.sql; do runf "$f" > /dev/null || fail "새 migration 적용 실패: $(basename "$f")"; done

runf "$D/test/snapshot.sql" -At > "$T/before.txt"
[ "$(grep -c '^cron ' "$T/before.txt")" = 3 ] || fail "옛 cron 작업 3개가 없다"

step "01 freeze"
runf "$D/01_freeze.sql" > /dev/null
runf "$D/test/15_after_freeze.sql" > /dev/null
expect_fail "이미 freeze 상태" "$D/01_freeze.sql"

step "02 dry-run (변경 없음)"
runf "$D/02_copy.sql" 2>&1 | grep -qF "dry-run 통과" || fail "02 dry-run 실패"
runf "$D/test/16_target_empty.sql" > /dev/null

step "02 apply + 값·RLS·set local 확인"
cat "$D/02_copy.sql" "$D/test/20_after_apply.sql" | run -v apply=1 > "$T/apply.txt" 2>&1 || { cat "$T/apply.txt" >&2; fail "02 apply"; }
grep -qF "적용(commit) 완료" "$T/apply.txt" || { cat "$T/apply.txt" >&2; fail "02 apply commit 없음"; }

step "02 재실행 거부"
expect_fail "재실행 거부" "$D/02_copy.sql" -v apply=1

step "익명 소유 행 → 중단"
runf "$D/test/30_add_anonymous.sql" > /dev/null
expect_fail "익명 사용자 소유 행 generator_profiles 1건" "$D/02_copy.sql"
run -c "delete from public.generator_profiles where user_id = '0a000000-0000-4000-8000-0000000000aa'; delete from auth.users where is_anonymous" > /dev/null

step "01_undo 정확 복원"
runf "$D/01_freeze_undo.sql" > /dev/null
runf "$D/test/snapshot.sql" -At > "$T/after.txt"
diff "$T/before.txt" "$T/after.txt" || fail "01_undo 뒤 권한·cron 이 freeze 전과 다르다"
[ "$(run -At -c "select to_regnamespace('nomad_cutover') is null")" = t ] || fail "nomad_cutover 스키마가 남았다"
expect_fail "freeze 기록이 없다" "$D/01_freeze_undo.sql"

echo "check: PASS ($DB, 컨테이너 $C)"
