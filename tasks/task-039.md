# task-039 Windows D-15 테마 번호

| 항목 | 내용 |
|---|---|
| 웨이브 | W7(P1) |
| 선행 | task-025, task-038 |
| 위험도 | 보통 |
| 보안 영향 | 없음(입력값 기기 처리·미전송·미저장) |
| 담당 | builder |
| 근거 | `spec D-15` · `docs/03_SCREENS_UX.md` D-15 상태 행 · `docs/adr/0004-pc-uses-mobile-visual-language.md` |
| 쓰기 허용 | `apps/desktop/**` |

## 할 것
- M-17 컴포넌트 재사용, 좌측 테마 입력·우측 결과 배치만 변경, 고지 고정 표기, D-01 진입

## 하지 않을 것
- PC 전용 컴포넌트 · 입력값 저장·전송

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter desktop test` 통과(M-17과 같은 입력·날짜 → 같은 번호)
- [ ] 768~1199·1200~ 두 구간 좌우 배치 스크린샷(`~/.claude/nomad/bin/shot`) 확인
