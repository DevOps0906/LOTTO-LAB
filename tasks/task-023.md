# task-023 모바일 M-09 수동 구매등록 + M-12 설정(P0 범위)

| 항목 | 내용 |
|---|---|
| 웨이브 | W3 |
| 선행 | task-022 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → codex-reviewer(design) |
| 근거 | `spec M-09` · `spec M-12` · `docs/04_API.md#1` A-07·A-14 메모(R2·R18·R19) |
| 쓰기 허용 | `packages/ui/src/screens/{M-09,M-12}/**`, `apps/mobile/src/routes/**` |

## 할 것
- M-09: 복권·회차·번호(연금 조·여섯 자리 문자열)·구매일·금액(원)·원본 연결·실제 구매 확인 체크, 같은 멱등 키 재사용, 필드 옆 오류·입력 보존
- M-12: 테마(다크모드)·권한 상태·약관 링크. 알림·로그인·동기화·계정 삭제는 P1 표시

## 하지 않을 것
- QR 등록 M-10, 푸시 등록(`push_devices`, P1)

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./packages/ui test -- M-09 M-12` 통과(확인 체크 전 확정 비활성, 두 번 제출해도 1건, 연금 `000719` 보존)
- [x] `pnpm --filter ./apps/mobile build` 성공

## 결과 (2026-11-13)
- M-09 `packages/ui/src/screens/M-09/PurchaseRegister.tsx`(멱등 키 진입 시 1회, 회차 suggestRound·확인 필요 시 비움, 회차 나중에 입력 = round null, 즐겨찾기 → 구매 전환), M-12 `M-12/Settings.tsx`(테마·19세 확인·권한·내보내기·모두 삭제 이중 확인·P1 안내). 라우트 `#/tickets/register`·`#/settings`(내 번호 헤더 톱니 링크).
- app-core 추가: `ageGate.confirmedAt`, `data`(LocalData: summary·export·clearAll), `theme`(ThemeStore, 키 `ll:v1:pref:theme`). 셸 `apps/mobile/src/theme.ts`가 <html>.dark 적용.
- 확인: ui·mobile·app-core 테스트, 캡처 `design/shots/M-09-app-*`·`M-12-app-*`.
