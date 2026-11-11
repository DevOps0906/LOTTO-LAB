# task-026 Windows D-04 통계 + D-14 회차 목록 + D-08 회차 상세

| 항목 | 내용 |
|---|---|
| 웨이브 | W4 |
| 선행 | task-020, task-021, task-024 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → codex-reviewer(design) + codex-reviewer(a11y) |
| 근거 | `spec D-04` · `spec D-14` · `spec D-08` · `docs/01_PRD.md#6` · `#9` 7 |
| 쓰기 허용 | `packages/ui/src/screens/{D-04,D-14,D-08}/**`, `apps/desktop/src/routes/**` |

## 할 것
- D-04: 대형 차트·히트맵·대체 표, 필수 표기 5종(기간·표본·기준선·출처·갱신 시각)
- D-14·D-08: M-16·M-11 로직 재사용, 넓은 표·검색 상태 복원

## 하지 않을 것
- 새 통계 지표 추가(task-015 범위만)

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/ui test -- D-04 D-14 D-08` 통과
- [ ] `pnpm --filter ./apps/desktop tauri build --debug` 성공
