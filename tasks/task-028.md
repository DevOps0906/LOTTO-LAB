# task-028 Windows D-06 내 번호 상세 + D-07 구매등록

| 항목 | 내용 |
|---|---|
| 웨이브 | W4 |
| 선행 | task-023, task-027 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → codex-reviewer(design) |
| 근거 | `spec D-06` · `spec D-07` · `docs/01_PRD.md#9` 6 · R1·R2·R19 |
| 쓰기 허용 | `packages/ui/src/screens/{D-06,D-07}/**`, `apps/desktop/src/routes/**` |

## 할 것
- D-06: M-08 로직 재사용, 이력(생성·저장·구매등록·대조), 구매번호만 기기 판정
- D-07: M-09 로직 재사용, 중복 등록 경고·멱등 키 유지

## 하지 않을 것
- 서버 판정(P1)

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/ui test -- D-06 D-07` 통과(미구매 대조 제외, 중복 제출 1건)
- [ ] `pnpm --filter ./apps/desktop tauri build --debug` 성공
