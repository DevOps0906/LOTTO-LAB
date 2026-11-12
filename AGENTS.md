# AGENTS.md — LOTTO-LAB

> 모든 AI 코딩 도구(Claude Code · ChatGPT Codex · Gemini CLI · OpenCode · Cursor)가 읽는 **단일 정본**. 80줄 이내로 유지한다.
> 영역별 상세 규칙은 `.claude/rules/*.md`(7장 표), 기획 근거는 `docs/`.

## 1. 무엇인가
만 19세 이상 성인을 위한 로또 6/45 · 연금복권 720+ 번호 생성·통계·내 번호 관리 앱(복권 판매·구매 대행 아님). 기획 정본: `docs/01_PRD.md` · 구조: `docs/02_ARCHITECTURE.md` · 결정: `docs/PLAN_BRIEF.md`.

## 2. 스택 (작업 시 최신 stable 확인 후 버전 고정)
| 영역 | 선택 | 위치 |
|---|---|---|
| 모바일(주) | React · Vite · TypeScript · Capacitor 8 (Android 먼저, iOS는 macOS 필요) | `apps/mobile` |
| Windows 설치형 | Tauri 2 (대시보드형, MSI/NSIS) · 같은 React UI | `apps/desktop` |
| 웹·관리자 | Next.js (App Router) · Tailwind CSS v4 — 랜딩(사전알림)·관리자 | `apps/web` |
| 공통 패키지 | 엔진(lotto·pension)·통계·Zod 검증·타입·디자인 토큰·UI | `packages/*` |
| DB·인증 | Supabase (Postgres · RLS · Auth · Edge Functions) | `supabase/` |
| 분석 워커 | Python — 공식 회차 적재·검증·통계 집계·백테스트 | `services/analytics-worker` |
| 모노레포 | pnpm workspaces · Turborepo | 루트 |

## 3. 명령
| 목적 | 명령 |
|---|---|
| 설치 | `pnpm install` |
| 개발 서버 | `pnpm dev` |
| 린트 · 타입 | `pnpm lint` · `pnpm typecheck` |
| 테스트 | `pnpm test` · `cd services/analytics-worker && pytest -q` |
| Android 동기화 | `pnpm --filter mobile build && npx cap sync android` |
| DB 초기화 · 타입 (Docker Desktop 필요) | `supabase start` · `supabase db reset` · `supabase gen types typescript --local > apps/web/src/types/db.ts` |
| ERD 갱신 | `~/.claude/nomad/bin/sql2erd supabase/migrations -o docs/diagrams/erd.mmd` |
명령은 1단계(기반) 구축 후 실제 스크립트에 맞춰 확정한다. 긴 출력 명령은 `~/.claude/nomad/bin/q <명령>`으로 실행한다.

## 4. 절대 규칙 (위반 = 리뷰 🔴)
- 비밀(API 키 · service_role · 결제 키)은 저장소·클라이언트 번들·로그에 넣지 않는다. `.env.example`에 이름만.
- 모든 테이블 RLS. 적용된 마이그레이션 파일은 수정하지 않고 새 번호 파일로 추가한다.
- 금액은 정수(원). 결제·차감 요청에는 멱등 키.
- 시스템 토큰·service_role은 모바일 번들에 절대 넣지 않는다(Capacitor 앱은 공개 키만).
- UI는 반응형 3구간(~767 / 768~1199 / 1200~), 색·크기는 토큰만(hex·px 직접 금지).
- 문서·커밋·화면 문구는 한국어, 코드 식별자는 영어.
- 새 의존성은 `secscan license`로 확인(GPL·AGPL 거부). 보안 레벨 `docs/01_PRD.md#8`.
- 연금복권 번호는 문자열(`CHAR(6)`, `^[0-9]{6}$`)로 다룬다 — 앞자리 0 보존(`1조 000719`).
- 생성(추천)·즐겨찾기·실제 구매·당첨확인 상태를 섞지 않는다. 추천 번호는 구매·당첨 이력이 아니다.
- '당첨 보장'·'확률 상승' 등 과대 표현 금지. 통계 화면에는 기준선·표본·기간·"미래 예측 아님"을 명시.
- 공식 서비스로 오인될 로고·상호·디자인 금지. 회차 결과에는 출처와 갱신 시각을 표시한다.
- 엔진은 불가능한 조건에서 무한 대기 없이 409 + 해결 안내. 엔진 변경 시 단위·속성 기반 테스트 필수.

## 5. 문서 지도 (필요한 장만 읽는다)
| 문서 | 내용 |
|---|---|
| `docs/00_LEAN.md` ~ `05_DATA_MODEL.md` · `docs/adr/` | 기획 정본 (린 · PRD · 구조 · 화면 · API · 데이터 · 결정) |
| `design/spec.json` · `design/wireframes/` | 화면 사양(`spec <ID>`)·와이어프레임 (plan2spec 생성) |
| `LOTTO_LAB_PRD.md` · `.pdf` · `design/reference/` | 원본 v1.0·모바일 시안 (참고용, 화면 숫자는 예시) |
| `docs/diagrams/*.mmd` | 구조도 · 흐름도 · ERD (Mermaid) |
| `DESIGN.md` · `packages/design-tokens/tokens.css` | 디자인 (정답은 토큰 파일, 모바일·Windows·웹 공용) |
| `tasks/README.md` · `tasks/NOW.md` | 작업 표 · 현재 상태 |

## 6. 작업 방식
작업은 `tasks/README.md`의 순서대로 하나씩. 작업 파일의 "근거"와 "하지 않을 것"을 지키고, 완료 조건을 실행으로 확인한 뒤 커밋한다.
커밋: `[task-NNN] 요약` + 본문(무엇을 · 확인 방법).

## 7. 영역 규칙 · 도구별 로드 (규칙 정본은 `.claude/rules/` 한 곳)
아래 경로의 파일을 만들거나 고치기 **전에** 해당 규칙 파일을 읽는다. Claude Code는 `paths:` 조건으로 자동 로드하므로 다시 읽지 않는다.
| 작업 경로 | 규칙 파일 |
|---|---|
| `apps/web/**` | `.claude/rules/web.md` |
| `supabase/functions/**` (Edge Function) | `.claude/rules/api.md` |
| `supabase/**` | `.claude/rules/db.md` |
| `apps/mobile/**` (Capacitor) | `.claude/rules/mobile.md` |
| `apps/desktop/**` (Tauri) | `.claude/rules/desktop.md` |
| `services/analytics-worker/**` | `.claude/rules/worker.md` |
| `docs/**` · `DESIGN.md` | `.claude/rules/docs.md` |
- 읽지 않는 파일: `.env*` · lock 파일 · `node_modules/` · `.next/` · `dist/` · `build/` · `coverage/` (Claude는 `.claude/settings.json`, Gemini는 `.geminiignore`가 강제, ChatGPT Codex는 이 줄로 지킨다).
- 도구별 설정: Claude Code `CLAUDE.md`·`.claude/` · ChatGPT Codex `.codex/config.toml` · Gemini CLI `.gemini/settings.json`·`.geminiignore`.
- 새 규칙 파일을 추가하면 이 표에도 한 줄 추가한다.

## 8. Codex 네이티브 팀
- 주 모델은 gpt-6.1-sol, 부 모델은 사용자가 확인한 지원 ID로만 지정한다. 초기 설정은 비활성이다.
- `nomad-os codex init . --worker-model <ID>` 적용 후 새 세션에서 시작하고 `nomad-os codex check .`로 검사한다.
- nomad_scout/designer/builder/tester/reviewer, 부 작업 최대 3개·깊이 1. 소유 파일을 명시하고 타인의 변경을 되돌리지 않는다.
- 설정 검사와 실제 모델 실행은 별개다. 운영 지침: NOMAD `global/nomad/CODEX_TEAM.md`.
