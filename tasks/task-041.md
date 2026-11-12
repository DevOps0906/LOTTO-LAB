# task-041 모바일 M-18 사주 프로필 · M-19 사주 번호

| 항목 | 내용 |
|---|---|
| 웨이브 | W7(P1) |
| 선행 | task-037, task-038, task-040, 로그인 작업(미등록 — `01#7` Q7) |
| 위험도 | 높음 |
| 보안 영향 | 인증 게이트 · 개인정보 저장(A-17) |
| 담당 | builder → reviewer(security) |
| 근거 | `spec M-18` · `spec M-19` · `docs/03_SCREENS_UX.md` 상태 행 · `docs/04_API.md` A-17 · `docs/adr/0005-fortune-numbers.md` |
| 쓰기 허용 | `apps/mobile/**` |

## 할 것
- 로그인 세션 없으면 M-18·M-19 진입 차단 + 가입 유도(M-06)
- M-18: 동의 후 A-17 저장·삭제, M-19: 프로필 → `fortune-engine` 기기 계산 → 결과 저장(generated, `method=saju`), 고지 고정 표기

## 하지 않을 것
- 성별 등 추가 수집 · 생년월일·시각을 로그·분석 이벤트에 기록 · 구매·당첨 상태 변경

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter mobile test` 통과: 비로그인 진입 차단, 동의 없이 저장 불가, 같은 날 같은 결과, 고정 번호 포함
- [ ] 프로필 삭제 후 A-17 GET 0행 확인
