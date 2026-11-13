# task-024 Windows D-11 온보딩 + D-01 대시보드 + D-09 설정

| 항목 | 내용 |
|---|---|
| 웨이브 | W4 |
| 선행 | task-010, task-017, task-023 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → codex-reviewer(design) |
| 근거 | `spec D-11` · `spec D-01` · `spec D-09` · `docs/01_PRD.md#9` 11 · `DESIGN.md`(R4·R14) · `docs/adr/0004-pc-uses-mobile-visual-language.md` · `design/reference/d-home.html` |
| 쓰기 허용 | `packages/ui/src/screens/{D-11,D-01,D-09}/**`, `apps/desktop/src/routes/**` |

## 할 것
- D-11: M-05 로직 재사용, 대시보드 레이아웃
- D-01: KPI(저장·구매등록·확인대기·이전 기간 대비), 기간별 구매등록 차트, 최근 공식 결과·대조대기 표, 요약 CSV 내보내기
- D-09: 테마·권한 상태, 로그인·동기화·알림·계정 삭제는 P1 표시
- 1200~ 좌측 사이드바, 768~1199 아이콘 레일(72), 최소 창 1024×700

- 이월(2026-11-13 팀장): 다크 모드에서 "구매 기록" 배지(남색 배경)가 카드와 대비가 약함 — 배지 테두리(--color-border) 추가 검토(모바일·Windows 공통 ui)

- 팀장 결정(2026-11-13): D-01 요약 CSV는 task-027(파일 저장 dialog 플러그인 도입과 함께), 이전 기간 대비 증감은 ADR-0004 시안에 없음 → P1. Windows 공유 버튼은 복사와 중복이라 숨김

## 하지 않을 것
- 로그인 D-10·알림함 D-13·동기화 D-12(P1)

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./packages/ui test -- D-11 D-01 D-09` 통과(기록 없음 → 생성/구매등록 CTA)
- [x] `pnpm --filter ./apps/desktop tauri build --debug` 성공

## 진행 메모 (2026-11-13 builder)
- D-11 = M-05 `layout="card"`(창 가운데 카드, 셸 `routes/AgeGateRoute.tsx`), D-01 = `Dashboard`(M-01 `Home` + 좌측 "지난 회차 결과"), D-09 = M-12 `canShare={false}`(2열).
- 시안 d-home·ADR-0004 기준으로 KPI·차트 대신 우측 "내 기록" 카드. 요약 CSV 내보내기·이전 기간 대비는 미구현(팀장 확인 필요).
- 이월 반영: `.dark .ll-badge[data-status="purchased"]` 테두리 `--color-border`. 캡처 `design/shots/D-0{1,9}-app-*`·`D-11-app-*`.
