# task-006b 공유 UI 오버레이 — 토스트·스낵바·얼럿 다이얼로그·시트·메뉴·툴팁

| 항목 | 내용 |
|---|---|
| 웨이브 | W1 |
| 선행 | task-006 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → codex-reviewer(design) |
| 근거 | 사용자 요청 2026-11-12 · `DevOps0906/nomad-design-modules` `_design-guide/ui-overlay-patterns/README.md`(용어·사용 기준·접근성 공통 규칙) · `DESIGN.md` 4장 오버레이 절 |
| 쓰기 허용 | `packages/ui/**`, `DESIGN.md` 4장 오버레이 절, 루트 `pnpm-lock.yaml` |

## 할 것
- 토스트(결과만)·스낵바(결과 + 실행 취소/다시 시도)·알림 큐, 얼럿 다이얼로그(영구 삭제 등), 반응형 시트(~767 바텀시트 ↔ 768~ 모달), 액션시트 ↔ 드롭다운 메뉴, 툴팁(호버·포커스) ↔ 정보 버튼(터치)
- 문구 규칙: 버튼과 같은 동사("저장" → "저장했어요"), 오류는 원인·해결, 사과하지 않음

## 하지 않을 것
- 팝오버·드로어(현재 화면에 필요 없음, AppShell이 내비 담당), 화면 적용(각 화면 작업에서)

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter @lotto-lab/ui typecheck && pnpm --filter @lotto-lab/ui test` 통과(큐 순서·지속 시간·호버/포커스 일시정지·실행 취소 콜백·Esc·포커스 트랩·복귀·aria-live)
- [x] 루트 `pnpm lint` · `design-preview --scan packages/ui/src` 0건
