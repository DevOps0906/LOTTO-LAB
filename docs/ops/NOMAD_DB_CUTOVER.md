# LOTTO-LAB 운영 DB 전환 절차 (public → nomad_lottolab, user안)

데이터 복사는 마이그레이션이 아니라 사람이 1회 실행하는 `supabase/nomad-cutover/` 스크립트로 한다. 스키마는 `supabase/migrations/`를 `db push`로만 올린다.
표별 대응·제외 규칙 정본: nomad-supabase-module `products/lottolab/existing.md` "운영 데이터 이관" 절.

## 0. 시작 전 확인
- 로컬 검사 통과: `bash supabase/nomad-cutover/check.sh` (컨테이너 `supabase_db_nomad-supabase-module` 안 일회용 DB `cutover_lottolab`만 사용).
- 점검 시간 공지(쓰기 중지 구간: 3~8단계). 스토리지 버킷 없음 → `03_storage` 단계 없음.
- `DB_URL`은 대시보드 연결 문자열(postgres 역할)을 셸 환경 변수로만 둔다. 파일·로그에 남기지 않는다.

## 1. 백업
`supabase db dump --linked -f <저장소 밖 경로>/schema.sql` · `supabase db dump --linked --data-only -f <저장소 밖 경로>/data.sql`. 복구 절차는 nomad-supabase-module `docs/BACKUP_RESTORE.md`.

## 2. API 노출 스키마 추가 (앱 배포 전)
대시보드 Settings → API → Exposed schemas에 `nomad_lottolab` 추가(`public`은 그대로). 이 시점엔 표가 없어도 된다. EF의 REST 호출은 `Content-Profile`/`Accept-Profile: nomad_lottolab` 헤더가 필요하다.

## 3. 쓰기 중지 (01 freeze)
`psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/nomad-cutover/01_freeze.sql`
- 옛 표 13개(public 12 + `private.rate_limits`)의 insert·update·delete를 anon·authenticated·service_role에서 회수(열 단위 포함). 읽기는 유지 → 옛 앱은 읽기 전용으로 동작.
- 옛 pg_cron 3개(`waitlist_purge_6m`·`rate_limits_purge`·`waitlist_purge_unconfirmed`) 기록 후 unschedule. 기록은 `nomad_cutover` 스키마.
- 옛 auth.users 트리거는 없다(있으면 스크립트가 중단).

## 4. 마이그레이션 기록 정리
옛 버전 6개를 되돌림 처리해야 `db push`가 새 파일만 본다:
`supabase migration repair --status reverted 20261112150000 20261112160000 20261112170000 20261112180000 20261113120000 20261113130000`

## 5. 새 스키마 적용
`supabase db push --dry-run`으로 목록 확인 → `supabase db push`. 새 pg_cron 작업(같은 이름, `nomad_lottolab` 대상)이 등록된다.

## 6. 복사 dry-run
`psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/nomad-cutover/02_copy.sql` → 마지막 줄 "dry-run 통과(rollback)".
중단 메시지가 나오면 원인을 고치고 다시 실행한다: freeze 미적용 / 대상 표가 비어 있지 않음 / 익명 사용자 소유 행(건수 보고, 버리지 않음 → 사람 결정) / 행 수·값·FK 불일치.

## 7. 복사 적용
`psql "$DB_URL" -v ON_ERROR_STOP=1 -v apply=1 -f supabase/nomad-cutover/02_copy.sql` → "적용(commit) 완료".
두 번 실행하면 "재실행 거부"로 멈춘다(안전).

## 8. 새 앱 배포·확인
모바일·EF를 `nomad_lottolab` 사용 버전으로 배포하고 로그인 → 저장 티켓·프리셋·사주 프로필·동의 기록이 보이는지, 다른 계정 데이터가 안 보이는지 확인.

## 9. 쓰기 재개 — **되돌릴 수 없는 지점**
새 앱이 `nomad_lottolab`에 쓰기 시작하면 그 뒤 데이터는 옛 표에 없다. 이후 되돌리기는 백업 복구 + 새 데이터 수동 이관뿐이다.
옛 public 표·함수는 지우지 않는다(별도 작업).

## 되돌리기 (9단계 전까지만)
1. 옛 앱을 그대로 쓰는 상태로 돌린다(새 앱을 배포했다면 이전 버전으로).
2. `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/nomad-cutover/01_freeze_undo.sql` → 권한·옛 cron 작업을 freeze 전과 같게 복원(스크립트가 대조 후 `nomad_cutover` 삭제).
   - 5단계 뒤라면 같은 이름의 새 cron 작업이 옛 명령으로 덮인다. 다시 이관할 때 7단계(apply)가 새 작업을 다시 등록한다.
3. 7단계 뒤 다시 이관하려면 복사된 행을 비운다(쓰기 재개 전이므로 새 데이터 없음):
   `truncate nomad_lottolab.draw_checks, nomad_lottolab.saved_tickets, nomad_lottolab.generated_numbers, nomad_lottolab.generated_batches, nomad_lottolab.generator_profiles, nomad_lottolab.fortune_profiles, nomad_lottolab.user_consents, nomad_lottolab.waitlist_signups, nomad_lottolab.draws_lotto, nomad_lottolab.draws_pension, nomad_lottolab.statistics_cache, nomad_lottolab.ingestion_runs, nomad_lottolab_private.rate_limits;`
4. 스키마 자체를 되돌려야 하면(드묾) 1단계 백업으로 복구한다.
