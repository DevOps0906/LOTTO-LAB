# task-006 디자인 토큰 패키지 + 공유 UI 기본 블록

| 항목 | 내용 |
|---|---|
| 웨이브 | W1 |
| 선행 | task-005 |
| 위험도 | 낮음 |
| 보안 영향 | 없음 |
| 담당 | builder → codex-reviewer(design) |
| 근거 | `DESIGN.md` · `docs/DESIGN_TOKENS.md` · `packages/design-tokens/tokens.css` · `~/.claude/skills/ux-patterns/SKILL.md` 2절 블록 |
| 쓰기 허용 | `packages/design-tokens/**`(tokens.css 값 변경 금지), `packages/ui/**` |

## 할 것
- `tokens.css`를 패키지로 내보내기(CSS·TS 상수), 반응형 3구간 글자 크기 토큰 사용
- 공유 블록: header·nav(탭바/사이드바)·card·stat·table·updated(출처·검증 시각)·빈/로딩/오류 상태 틀, 다크모드

## 하지 않을 것
- 토큰 값 수정(수정은 tokens.css → `design-preview --md` 재생성 절차, 팀장 승인), 화면 구현

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./packages/ui typecheck && pnpm --filter ./packages/ui test` 통과
- [x] `~/.claude/nomad/bin/design-preview --scan packages/ui/src` 하드코딩 색·크기 0건
