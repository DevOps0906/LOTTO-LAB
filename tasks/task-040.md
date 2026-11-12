# task-040 `fortune_profiles` 스키마 + RLS

| 항목 | 내용 |
|---|---|
| 웨이브 | W7(P1) |
| 선행 | task-008 |
| 위험도 | 높음 |
| 보안 영향 | RLS · 개인정보(생년월일·태어난 시각) |
| 담당 | builder → reviewer(security) |
| 근거 | `docs/05_DATA_MODEL.md#2`·`#3` `fortune_profiles` · `docs/04_API.md` A-17·5절 운세 위협 메모 |
| 쓰기 허용 | `supabase/migrations/**`(새 번호 파일만) · `supabase/tests/**` |

## 할 것
- `fortune_profiles` 테이블·CHECK·owner-only RLS, `auth.users` CASCADE 파기
- `generated_batches` 출처 `method` 반영(방식은 `05#2` 팀장 결정 후)

## 하지 않을 것
- 적용된 마이그레이션 수정 · 성별 등 추가 컬럼 · 서버 사주 계산

## 완료 조건 (실행 가능한 확인)
- [ ] `supabase db reset` 성공, RLS 테스트: 타인 행 SELECT/UPDATE/DELETE 0행, anon 접근 거부, 계정 삭제 시 행 삭제
- [ ] `~/.claude/nomad/bin/sql2erd supabase/migrations -o docs/diagrams/erd.mmd` 갱신
