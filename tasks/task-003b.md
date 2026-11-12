# task-003b 사전알림 이메일 이중 확인 (확인 메일 · A-19)

| 항목 | 내용 |
|---|---|
| 웨이브 | W0 |
| 선행 | task-003 |
| 위험도 | 높음 (challenger 착수 전 검토 — 개인정보·외부 메일 발송·노출 면) |
| 보안 영향 | 민감 데이터(이메일) · 외부 메일 발송 · 노출 면(A-19) |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | 사용자 결정 2026-11-12(이중 확인) · `docs/04_API.md#1` A-15·A-19 · `docs/05_DATA_MODEL.md#2` waitlist_signups · `docs/01_PRD.md#8` |
| 쓰기 허용 | `supabase/migrations/*waitlist*`(새 번호 파일만), `supabase/functions/waitlist*/**`, `supabase/functions/_shared/**`, `supabase/tests/waitlist*`, `supabase/config.toml`, `supabase/README.md` |

## 할 것
- A-15: RPC `waitlist_request_confirm` 1회(원자적: 미확인만 갱신·이메일별 24h 3통 창·토큰 해시 저장 → 발송 여부 반환) → 응답은 항상 202, 메일 발송은 응답 뒤(`EdgeRuntime.waitUntil`) — 확인 여부·한도·발송 실패가 응답·시간으로 드러나지 않게
- A-19(별도 EF `waitlist-confirm`): 토큰 해시 조회 → 미만료면 `confirmed_at`·`consented_at` 1회 확정(이미 확정이면 200 동일), 실패 400 동일. 레이트리밋 키 `confirm:` 접두
- 메일 발송기: `MAIL_API_URL`·`MAIL_API_KEY`·`MAIL_FROM`·`CONFIRM_BASE_URL` 필수 env(기본값 없음, 없으면 fail-closed). 로컬은 Mailpit(EF 컨테이너 기준 주소), 운영 서비스는 사용자 결정. 확인 메일은 거래성 안내 — "요청하지 않았다면 무시하세요(24시간 후 자동 삭제)" 문구
- 미확인 만료 행 pg_cron 삭제

## 하지 않을 것
- 출시 알림 일괄 발송·A-18(task-044), 웹 확인 화면(task-004)

## 완료 조건 (실행 가능한 확인)
- [x] `npx supabase@3.1.0 test db` 통과(확인 전후 상태·토큰 해시·만료 삭제)
- [x] Deno 단위·통합: 신청 → Mailpit에 메일 도착 → 링크 토큰으로 A-19 200 → 재제출 200·위조 400, 확인된 이메일 재신청 시 consented_at 불변, 4번째 확인 메일 미발송(응답은 202 동일)
