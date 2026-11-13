# task-044 사전알림 메일 발송 · 수신 거부 링크 · 발송 후 파기

| 항목 | 내용 |
|---|---|
| 웨이브 | W6 (출시 직전) |
| 선행 | task-003 |
| 위험도 | 높음 (challenger 착수 전 검토 — 개인정보·외부 메일 발송) |
| 보안 영향 | 민감 데이터(이메일) · 새 외부 서비스(메일 발송) · 노출 면(A-18) |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | `docs/04_API.md#1` A-18 · `docs/01_PRD.md#8` 민감 데이터 · 개인정보보호법 36조·정보통신망법 50조(수신 거부) |
| 쓰기 허용 | `supabase/functions/waitlist-unsubscribe/**`, `supabase/migrations/*waitlist*`(새 번호), `supabase/tests/waitlist*`, `services/analytics-worker/**`(발송 배치 시) |

## 할 것
- A-18: 서명 토큰(HMAC) 검증 후 해당 행 삭제, 행 유무와 무관하게 같은 응답(존재 노출 금지)
- 출시 알림 일괄 발송: 메일마다 A-18 링크·발신자·수신 거부 안내 포함 → 발송 성공 행은 즉시 삭제, 실패는 재시도 후 삭제
- 메일 발송 서비스·키는 사용자 결정(새 의존성은 `secscan license`)

## 하지 않을 것
- 마케팅 메일 반복 발송(출시 알림 1회만), 이메일 원문 로그

## 완료 조건 (실행 가능한 확인)
- [ ] A-18 테스트: 올바른 서명 → 삭제, 잘못된 서명 400, 없는 이메일도 같은 응답
- [ ] 발송 배치 테스트(가짜 발송기): 성공 행 삭제·실패 행 재시도 후 삭제, `waitlist_signups` 0행
