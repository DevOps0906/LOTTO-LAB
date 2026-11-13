# task-040 `fortune_profiles` 스키마 + RLS

| 항목 | 내용 |
|---|---|
| 웨이브 | W7(P1) |
| 선행 | task-008 |
| 위험도 | 높음 |
| 보안 영향 | RLS · 개인정보(생년월일·태어난 시각) |
| 담당 | builder → reviewer(security) |
| 근거 | `docs/05_DATA_MODEL.md#2`·`#3` `fortune_profiles` · `docs/04_API.md` A-17·5절 운세 위협 메모 |
| 쓰기 허용 | `supabase/migrations/**`(새 번호 파일만) · `supabase/tests/**` · `docs/05_DATA_MODEL.md`(fortune_profiles 행) · `docs/04_API.md`(A-17 행) · `docs/diagrams/erd.mmd` |

## 할 것
- `fortune_profiles` 테이블·CHECK·owner-only RLS, `auth.users` CASCADE 파기
- ~~`generated_batches` 출처 `method` 반영~~ — 이미 `20261112180000_user_data.sql`에 6개 값 CHECK로 있음(완료)

- 팀장 결정(2026-11-13, challenger 반영): ① `birth_date text` + 정규식, 판정은 `CASE calendar WHEN 'solar' THEN pg_input_is_valid(birth_date,'date') … WHEN 'lunar' THEN 일 ≤ 30 END`(형변환 예외로 원문이 오류에 실리지 않게) ② 양력·음력 모두 `'1900-01-01' ≤ birth_date ≤ (now() AT TIME ZONE 'Asia/Seoul')::date::text`(엔진 KST와 일치) ③ `birth_hour text NULL CHECK(12시진 ID: ja·chuk·in·myo·jin·sa·o·mi·sin·yu·sul·hae)` — 사용자 승인값(12시진). 한계: 야자시/조자시 구분 정보 없음 → task-046에서 필요하면 선택 열 추가 ④ `is_leap_month`는 lunar일 때만 true ⑤ `consented_at DEFAULT now()`, `updated_at` 트리거, INSERT·UPDATE 열 GRANT에서 consented_at·updated_at 제외. user_id UPDATE는 허용(2026-11-13 갱신: PostgREST upsert가 SET에 모든 열을 넣어 제외 시 403 — 다른 uid 변경은 RLS WITH CHECK 42501) — A-17 PUT(upsert on_conflict=user_id) 경로가 42501 없이 되는지 테스트 ⑥ 테스트: 타인 user_id INSERT 42501, user_id 변경 UPDATE 42501, 경계 벡터(2/29 윤년·양력 2/30 거부·음력 02-30 허용·solar+leap 거부·1899-12-31 거부·KST 오늘 허용·내일 거부·잘못된 시진 거부) ⑦ 타입 재생성은 생략(`apps/web/src/types/db.ts` 없음)

## 하지 않을 것
- 적용된 마이그레이션 수정 · 성별 등 추가 컬럼 · 서버 사주 계산

## 완료 조건 (실행 가능한 확인)
- [x] `supabase db reset` 성공, RLS 테스트: 타인 행 SELECT/UPDATE/DELETE 0행, 쓰기 42501, anon 접근 거부, 계정 삭제 시 행 삭제, 결정 ⑥ 경계 벡터
- [x] `~/.claude/nomad/bin/sql2erd supabase/migrations -o docs/diagrams/erd.mmd` 갱신
