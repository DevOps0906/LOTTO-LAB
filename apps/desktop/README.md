# @lotto-lab/desktop — Windows 셸 (Tauri 2)

React 19 · Vite 8 · TypeScript 6 · Tauri 2.12(CLI·API 2.12.4, crate 2.12.5) · Tailwind CSS v4(토큰 처리용). identifier `kr.lottolab.app`(변경 불가).
화면 로직은 `packages/ui`·`packages/app-core`에 있고, 이 앱은 내비게이션·플랫폼 어댑터·창/보안 설정만 가진다.

## 진행 현황
- [x] task-010: 셸 틀(사이드바 8항목, 768~1199 아이콘 레일, 해시 라우팅), app-core 어댑터 주입, 디버그 빌드
- [ ] 화면 구현(이후 작업), 설치본 서명·updater(task-035)

## 구조
| 경로 | 내용 |
|---|---|
| `src/App.tsx` · `src/routes.ts` | `AppShell`(ui) + 사이드바 대시보드·로또 생성·연금 생성·통계·내 번호·회차·알림·설정 |
| `src/platform/*` | app-core `Adapters` 구현 — 저장 `tauri-plugin-store`(Rust setup이 앱 데이터 폴더에 `lotto-lab.json`을 만들고 프런트는 `getStore`로 가져오기만, `flush()` = `save()`), 클립보드, 외부 링크 `opener`(http·https만), 공유 = 클립보드 복사(Windows 공유 시트 없음), 난수 `crypto.getRandomValues` |
| `src/core.ts` · `src/config.ts` | `createAppCore` 1회 생성, 설정 없으면 core 없이 안내 표시 |
| `src-tauri/tauri.conf.json` | 창 1개(최소 1024×700), CSP(connect-src는 self·IPC만, 로컬 Supabase는 `devCsp`에만), updater 없음 |
| `src-tauri/capabilities/main.json` | `core:default` · store `get-store·get·set·delete·keys·save`(load 없음) · `clipboard-manager:allow-write-text` · `opener:allow-open-url`(http·https). fs·shell 없음 |
| `scripts/release-config.mjs` | 운영 Supabase origin을 CSP에 넣은 `src-tauri/tauri.release.conf.json` 생성(커밋 안 함) |
| `scripts/check-release.mjs` | 번들 검사: 서버 키·서버 역할 JWT·로컬 주소·평문 http |
| `src-tauri/deny.toml` | Rust 라이선스 허용 목록(GPL·AGPL·LGPL 없음) |

## 설정 (Supabase 공개 값)
1. `cp .env.example .env.local` (`.env.local`은 커밋되지 않는다)
2. 로컬 개발: `supabase start` 후 `supabase status`의 **Publishable key**(`sb_publishable_...`)를 `VITE_SUPABASE_PUBLISHABLE_KEY`에 넣는다. `VITE_SUPABASE_URL`을 비우면 `http://127.0.0.1:54521`을 쓴다.
3. 서버 키(`sb_secret_...`)는 절대 넣지 않는다 — app-core가 거부한다.
4. 로컬 주소 대체는 개발 빌드에서만이다. 운영 빌드는 URL이 없으면 대체하지 않고 "서버 연결 설정이 없습니다" 안내를 띄운다.
5. CSP: 기본 `csp`의 connect-src는 `'self' ipc: http://ipc.localhost`뿐이다. 로컬 Supabase(`http://127.0.0.1:54521`)는 `pnpm tauri dev`가 쓰는 `devCsp`에만 있다 — `tauri build --debug` 실행본은 Supabase에 연결하지 않는다. 운영 주소는 `build:release`가 주입한다.

## 명령
| 목적 | 명령 (apps/desktop에서) |
|---|---|
| 앱 개발 실행 | `pnpm tauri dev` (Vite `127.0.0.1:5174`) |
| 타입 · 린트 · 테스트 | `pnpm typecheck` · `pnpm lint` · `pnpm test` |
| 디버그 exe(설치본 없음) | `pnpm tauri build --debug --no-bundle` → `src-tauri/target/debug/lotto-lab-desktop.exe` |
| 릴리스 빌드 | `pnpm build:release` (아래 절차) |
| 번들 검사만 | `pnpm build && pnpm check:release` |
| Rust 라이선스 · 취약점 | `cd src-tauri && cargo deny check licenses && cargo audit` |

사전 조건: Rust stable(MSVC), Visual Studio Build Tools(C++), WebView2 런타임, Node 20.9+, pnpm 10. `Cargo.lock`은 커밋한다.

## 릴리스 빌드
필수 env(셸 환경변수 또는 `.env.production.local`, 커밋 금지): `VITE_SUPABASE_URL`(운영 https origin, path·query 없음, 로컬 주소 불가) · `VITE_SUPABASE_PUBLISHABLE_KEY`.

`pnpm build:release` 순서:
1. `scripts/release-config.mjs` — env 검증(없거나 https origin이 아니면 실패) 후 `src-tauri/tauri.release.conf.json` 생성. 내용은 CSP connect-src에 운영 origin 추가 + `beforeBuildCommand`를 `pnpm build && node scripts/check-release.mjs`로 덮어쓰기
2. `tauri build --config src-tauri/tauri.release.conf.json` — Tauri가 기본 설정 위에 JSON 병합 → 웹 빌드 → 번들 검사 → MSI·NSIS(WiX·NSIS 도구 내려받음)

설치본 서명·updater는 task-035.

## 보안 메모
- 자체 Rust 명령(IPC)은 없다. 추가하면 인자를 모두 검증한다(경로 정규화·길이·형식).
- 저장 파일은 앱 데이터 폴더에만 만든다(파일 시스템 플러그인 없음).
- 서명 키·인증서는 CI 비밀로만(task-035).
