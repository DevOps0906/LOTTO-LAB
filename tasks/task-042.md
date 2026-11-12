# task-042 Windows D-16 사주 프로필 · D-17 사주 번호

| 항목 | 내용 |
|---|---|
| 웨이브 | W7(P1) |
| 선행 | task-039, task-041 |
| 위험도 | 높음 |
| 보안 영향 | 인증 게이트 · 개인정보 저장(A-17) |
| 담당 | builder → reviewer(security) |
| 근거 | `spec D-16` · `spec D-17` · `docs/03_SCREENS_UX.md` 상태 행 · `docs/adr/0004-pc-uses-mobile-visual-language.md` |
| 쓰기 허용 | `apps/desktop/**` |

## 할 것
- M-18·M-19 컴포넌트 재사용, 좌측 프로필 요약·우측 결과 배치만 변경, 비로그인 진입 차단 + D-10 유도

## 하지 않을 것
- PC 전용 컴포넌트 · 추가 개인정보 수집 · 입력값 로그 기록

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter desktop test` 통과: 비로그인 진입 차단, M-19와 같은 프로필·날짜 → 같은 번호
- [ ] 768~1199·1200~ 두 구간 스크린샷(`~/.claude/nomad/bin/shot`) 확인
