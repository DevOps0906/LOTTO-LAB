# @lotto-lab/mobile — 모바일 셸 (Capacitor 8, Android 먼저)

React 19 · Vite 8 · TypeScript 6 · Capacitor 8.6 · Tailwind CSS v4(토큰 처리용). 앱 ID `kr.lottolab.app`(변경 불가).
화면 로직은 `packages/ui`·`packages/app-core`에 있고, 이 앱은 내비게이션·플랫폼 어댑터·네이티브 설정만 가진다.

## 진행 현황
- [x] task-009: 셸 틀(하단 탭 홈·추천·통계·내번호, 해시 라우팅), app-core 어댑터 주입, Android 디버그 빌드
- [ ] 화면 구현(이후 작업), iOS(macOS 필요), 서명·스토어 배포(task-035)

## 구조
| 경로 | 내용 |
|---|---|
| `src/App.tsx` · `src/routes.ts` · `src/router.ts` | `AppShell`(ui) + 탭 4개, `#/` `#/generate` `#/stats` `#/tickets` |
| `src/platform/*` | app-core `Adapters` 구현 — 저장 `@capacitor/preferences`, 클립보드·공유·외부 링크(`@capacitor/browser`, http·https만), 난수 `crypto.getRandomValues` |
| `src/core.ts` · `src/config.ts` | `createAppCore` 1회 생성, 설정 없으면 core 없이 안내 표시 |
| `src/native.ts` | Android 백 버튼(기록 있으면 뒤로, 없으면 종료) · 시스템 다크 모드(`.dark`) |
| `capacitor.config.ts` | `androidScheme: https` · `cleartext: false` · `allowNavigation: []` · `server.url`은 `CAP_SERVER_URL` 있을 때만 |
| `android/` | Capacitor Android 프로젝트. `allowBackup=false` + `data_extraction_rules.xml`, 권한은 INTERNET만 |
| `scripts/check-release.mjs` | 릴리스 점검: 운영 env·server.url·cleartext·권한·백업·병합 매니페스트(release)·번들의 서버 키·로컬 주소·평문 http |
| `scripts/build-release.mjs` | 릴리스 빌드 순서 고정(점검을 건너뛸 수 없다) |

## 설정 (Supabase 공개 값)
1. `cp .env.example .env.local` (`.env.local`은 커밋되지 않는다)
2. 로컬 개발: `supabase start` 후 `supabase status`의 **Publishable key**(`sb_publishable_...`)를 `VITE_SUPABASE_PUBLISHABLE_KEY`에 넣는다. `VITE_SUPABASE_URL`을 비우면 `http://127.0.0.1:54521`을 쓴다.
3. 서버 키(`sb_secret_...`)는 절대 넣지 않는다 — app-core가 거부하고 `check:release`가 번들에서 찾으면 실패한다.
4. 키가 없으면 앱은 뜨지만 "서버 연결 설정이 없습니다" 안내가 나온다.
5. 로컬 주소 대체는 개발 빌드(`pnpm dev`)에서만이다. 운영 빌드(`pnpm build`)는 URL이 없으면 대체하지 않고 같은 안내를 띄운다.

> 실기기·에뮬레이터는 `cleartext: false`라 `http://127.0.0.1` 로컬 Supabase에 붙지 않는다. 기기에서 확인하려면 https 주소가 필요하다.

## 명령
| 목적 | 명령 (apps/mobile에서) |
|---|---|
| 웹 개발 서버 | `pnpm dev` |
| 타입 · 린트 · 테스트 | `pnpm typecheck` · `pnpm lint` · `pnpm test` |
| 웹 빌드 + Android 동기화 | `pnpm build && pnpm exec cap sync android` |
| 디버그 APK | `cd android && gradlew.bat assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk` |
| 릴리스 빌드 | `pnpm build:release` (아래 절차) |
| 릴리스 점검만 | `pnpm check:release` (`--merged`면 병합 매니페스트까지) |

## 릴리스 빌드
필수 env(셸 환경변수 또는 `.env.production.local`, 커밋 금지): `VITE_SUPABASE_URL`(운영 https origin, path·query 없음) · `VITE_SUPABASE_PUBLISHABLE_KEY`. `CAP_SERVER_URL`은 비워 둔다.

`pnpm build:release`가 다음 순서로 실행하고 하나라도 실패하면 멈춘다:
1. `pnpm build` → 2. `cap sync android` → 3. `check:release`(env·설정·소스 매니페스트·번들) → 4. `gradlew :app:processReleaseMainManifest` → 5. `check:release --merged`(release 병합 매니페스트: debuggable·권한) → 6. `gradlew assembleRelease`

산출물은 서명 안 된 `android/app/build/outputs/apk/release/app-release-unsigned.apk`이다. 서명·AAB는 task-035.

사전 조건: JDK 21, `ANDROID_HOME`(platform 36·build-tools), Node 20.9+, pnpm 10.

## 보안 메모
- 외부 링크·OAuth는 시스템 브라우저로만 연다. WebView에 원격 페이지를 띄우지 않는다.
- Preferences에는 비민감 값만 둔다(세션 토큰은 P1 로그인 작업에서 보안 저장소로).
- WebView 원격 디버깅은 Capacitor 기본값(디버그 빌드만)을 따른다.
- 라이브 리로드(`CAP_SERVER_URL=... pnpm exec cap sync android`) 뒤에는 반드시 값 없이 다시 sync한다 — 남아 있으면 `check:release`가 실패한다.
