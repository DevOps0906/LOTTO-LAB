# task-009 모바일 셸 (Capacitor 8, Android 먼저)

| 항목 | 내용 |
|---|---|
| 웨이브 | W1 |
| 선행 | task-005, task-006 |
| 위험도 | 높음 |
| 보안 영향 | 의존성(Capacitor·플러그인) · 키·권한(앱 권한 선언) |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | `docs/02_ARCHITECTURE.md#1` `#2` `#5` · `docs/adr/0001-capacitor-tauri-shared-core.md` · `docs/01_PRD.md#9` 8 |
| 쓰기 허용 | `apps/mobile/**`, 루트 `pnpm-workspace.yaml`(catalog)·`.gitignore`·`eslint.config.mjs`(ignores)·`pnpm-lock.yaml`, `apps/web`·`packages/ui`의 package.json(catalog 전환만) |

## 할 것
- Vite + React + Capacitor 8(마이너는 최신 stable 확인) 셸, 하단 탭 4개(홈·추천·통계·내번호) 틀
- P0 어댑터 구현: 클립보드·공유·로컬 저장(키-값 vs SQLite는 착수 전 팀장 결정 필요, `02#5`. 인터페이스는 task-016에서 맞춤), 안전 영역·Android 백 버튼·다크모드
- Android 매니페스트에 P0에 필요 없는 권한(카메라·알림) 선언 금지

- 팀장·사용자 결정(2026-11-12, challenger 반영): ① 앱 ID `kr.lottolab.app`(Android applicationId·Tauri identifier, 사용자 결정 — 변경 불가) ② 로컬 저장은 키-값(사용자 결정) — 모바일 `@capacitor/preferences`, Windows `tauri-plugin-store`(앱 데이터 폴더만) ③ 어댑터 인터페이스는 셸 안 임시 타입(`src/adapters.ts`), app-core 이관은 task-016 ④ 루트 `pnpm-workspace.yaml` catalog로 react·react-dom·vite·typescript·vitest 단일 버전(web·ui 포함) ⑤ 루트 `.gitignore`·`eslint.config.mjs` ignores에 생성물(android 빌드·assets/public, src-tauri/target·gen) 추가 ⑥ 내비 정본: 모바일 하단 탭 홈·추천·통계·내번호, Windows 사이드바 8항목(DESIGN 4장), 해시 라우팅 ⑦ 완료 조건 전 사전 점검(java -version 21·ANDROID_HOME·link.exe·WebView2) — 실패 시 "차단"으로 보고
- 모바일(009): P0 플러그인만 — app(백 버튼)·clipboard·share·preferences·browser(외부 링크·시스템 브라우저). secure storage 없음(로그인 P1). capacitor.config: cleartext false·androidScheme https·allowNavigation 비움·server.url은 환경변수 있을 때만, 릴리스 점검 스크립트(server.url·cleartext 없음 확인). AndroidManifest allowBackup=false(+dataExtractionRules). 빌드 `gradlew.bat assembleDebug`

## 하지 않을 것
- 화면 로직·API 호출(`packages/*`에), iOS 빌드, 서명 키 설정(task-035)

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./apps/mobile build && pnpm --filter ./apps/mobile exec cap sync android` 성공
- [x] `cd apps/mobile/android && ./gradlew assembleDebug` 성공
- [x] `grep -rn "service_role" apps/mobile` 0건
