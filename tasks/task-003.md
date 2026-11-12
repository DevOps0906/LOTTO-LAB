# task-003 사전알림 백엔드: `waitlist_signups` + A-15 Edge Function

| 항목 | 내용 |
|---|---|
| 웨이브 | W0 |
| 선행 | task-002 |
| 위험도 | 높음 (challenger 착수 전 검토) |
| 보안 영향 | 노출 면 · 민감 데이터(이메일) · 의존성(Turnstile·pg_cron, R25) · 마이그레이션 |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | `docs/04_API.md#1` A-15 · `#4` · `#5` A-15 · `docs/05_DATA_MODEL.md#2` `#3` waitlist_signups · `docs/REVIEW_doc.md` R21·R22·R23·R25 |
| 쓰기 허용 | `supabase/config.toml`, `supabase/migrations/*waitlist*`, `supabase/functions/waitlist/**`, `supabase/tests/waitlist*` |

## 할 것
- R25: Turnstile·pg_cron을 `security-baseline` 기준으로 확인 후 도입(버전·권한 기록)
- 마이그레이션: 테이블·anon INSERT만 RLS·UNIQUE(lower(email))·pg_cron 6개월 삭제 작업
- EF A-15: Turnstile 검증 → INSERT `ON CONFLICT DO NOTHING` → 항상 202. R23: Turnstile 실패는 400(사유 미노출)으로 구현하고 `docs/04_API.md#2`에 반영. 코드명은 기존 `INVALID_INPUT` 재사용(R23 확정)
- R22: IP 레이트리밋 구현 방식(DB 카운터/외부 저장소)은 팀장 결정 필요. 수치는 측정 후 확정해 `04#4`에 기록

## 하지 않을 것
- 다른 테이블 마이그레이션(task-007·008), 랜딩 UI(task-004)

## 완료 조건 (실행 가능한 확인)
- [x] `supabase db reset` 성공, `supabase test db` 통과(anon SELECT/UPDATE/DELETE 거부, 동의 false INSERT 거부)
- [x] `supabase functions serve` 상태에서 중복 이메일·신규 이메일 모두 202, 잘못된 토큰 400, 한도 초과 429 테스트 통과
- [x] `~/.claude/nomad/bin/secscan` 통과
