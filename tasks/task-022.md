# task-022 모바일 M-07 내 번호 + M-08 상세·당첨확인(기기 판정)

| 항목 | 내용 |
|---|---|
| 웨이브 | W3 |
| 선행 | task-018, task-019, task-021 |
| 위험도 | 보통 |
| 보안 영향 | 없음 (게스트 로컬 데이터) |
| 담당 | builder → codex-reviewer(design) |
| 근거 | `spec M-07` · `spec M-08` · `docs/01_PRD.md#9` 6 · `docs/02_ARCHITECTURE.md#3` DF-5 · R1 |
| 쓰기 허용 | `packages/ui/src/screens/{M-07,M-08}/**`, `apps/mobile/src/routes/**` |

## 할 것
- M-07: 생성·즐겨찾기·실제 구매 탭 분리, 검색·필터·정렬, 선택 대조
- M-08: 구매 상태·판정 상태·대조 이력, 구매번호만 `lottery-core` 기기 판정, 미구매는 대조 제외·등록 안내, 추첨 전은 확인대기
- QR 등록 버튼은 P1 비활성

## 하지 않을 것
- 서버 판정 A-09·푸시(P1)

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/ui test -- M-07 M-08` 통과(즐겨찾기 행 대조 버튼 없음, 구매 행만 checked)
- [ ] `pnpm --filter ./apps/mobile build` 성공
