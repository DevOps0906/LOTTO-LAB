# task-025 Windows D-02 로또 생성 + D-03 연금 생성 (조건·결과 좌우 배치)

| 항목 | 내용 |
|---|---|
| 웨이브 | W4 |
| 선행 | task-018, task-019, task-024 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → codex-reviewer(design) |
| 근거 | `spec D-02` · `spec D-03` · `docs/01_PRD.md#9` 11·12 · R4 · `docs/adr/0004-pc-uses-mobile-visual-language.md` · `design/reference/d-lotto.html` |
| 쓰기 허용 | `packages/ui/src/screens/{D-02,D-03}/**`, `apps/desktop/src/routes/**` |

## 할 것
- 좌측 조건 폼·우측 결과 표, 768~1199에서도 좌우 유지(R4)
- M-02·M-03의 화면 로직 재사용, 오류 시 기존 결과 유지·조건 강조
- 네트워크 차단 상태에서 생성·로컬 저장 동작

## 하지 않을 것
- 고급 조건 동작(P1, 자리 표시만)

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./packages/ui test -- D-02 D-03` 통과(오프라인 모의에서 생성 성공, `000719` 보존)
- [x] `pnpm --filter ./apps/desktop tauri build --debug` 성공

## 진행 메모 (2026-11-13 builder)
- M-02·M-03에 `layout="split"`(768~ 좌우, 결과 열이 좁으면 결과 줄 두 줄 — 컨테이너 쿼리)·`canShare={false}`(Windows 공유 = 복사). 캡처 `design/shots/D-0{2,3}-app-*`.
