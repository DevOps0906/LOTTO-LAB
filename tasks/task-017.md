# task-017 모바일 M-05 온보딩·19세 확인 + M-01 홈 + M-15 추천 선택

| 항목 | 내용 |
|---|---|
| 웨이브 | W3 |
| 선행 | task-009, task-016 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → codex-reviewer(design) |
| 근거 | `spec M-05` · `spec M-01` · `spec M-15` · `docs/02_ARCHITECTURE.md#3` DF-6 |
| 쓰기 허용 | `packages/ui/src/screens/{M-05,M-01,M-15}/**`, `apps/mobile/src/routes/**` |

## 할 것
- M-05: 확인 전 본문 차단, 미성년·거절 시 종료 안내, 로그인 버튼은 P1 비활성 표시
- M-01: 최신 회차 카드(출처·검증 시각), 저장/구매/확인대기 수, 1게임 빠른 생성. 알림·로그인 진입은 P1 비활성
- M-15: 로또·연금 진입, 지난 설정 재사용(로컬 프리셋)
- 각 화면 상태 4종(빈·로딩·오류·성공)은 `spec` 상태 행 그대로

## 하지 않을 것
- 알림함 M-13·로그인 M-06(P1)

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./packages/ui test -- M-05 M-01 M-15` 통과(19세 미확인 시 홈 진입 불가, 회차 0행 → 미갱신 안내)
- [x] `pnpm --filter ./apps/mobile build` 성공
