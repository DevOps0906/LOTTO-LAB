# task-010 Windows 셸 (Tauri 2)

| 항목 | 내용 |
|---|---|
| 웨이브 | W1 |
| 선행 | task-005, task-006 |
| 위험도 | 높음 |
| 보안 영향 | 의존성(Tauri·Rust crate) · 키·권한(capabilities 허용 범위) |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | `docs/02_ARCHITECTURE.md#1` `#2` `#5` `#6` · `docs/adr/0001-capacitor-tauri-shared-core.md` · `docs/01_PRD.md#9` 11·12 |
| 쓰기 허용 | `apps/desktop/**`, 루트 `pnpm-workspace.yaml`(catalog)·`.gitignore`·`eslint.config.mjs`(ignores)·`pnpm-lock.yaml`, `apps/web`·`packages/ui`의 package.json(catalog 전환만) |

## 할 것
- Vite + React + Tauri 2(마이너 최신 stable 확인) 셸, 사이드바 8항목(`03` D-01 정본) 틀, 768~1199 아이콘 레일
- 창 최소 1024×700, P0 어댑터: 클립보드·앱 데이터 폴더 로컬 저장(구현체는 task-009와 같은 팀장 결정)
- capabilities는 P0 사용 API만 허용(파일 시스템은 앱 데이터 폴더 범위)

- 팀장·사용자 결정(2026-11-12, challenger 반영): ① 앱 ID `kr.lottolab.app`(Android applicationId·Tauri identifier, 사용자 결정 — 변경 불가) ② 로컬 저장은 키-값(사용자 결정) — 모바일 `@capacitor/preferences`, Windows `tauri-plugin-store`(앱 데이터 폴더만) ③ 어댑터 인터페이스는 셸 안 임시 타입(`src/adapters.ts`), app-core 이관은 task-016 ④ 루트 `pnpm-workspace.yaml` catalog로 react·react-dom·vite·typescript·vitest 단일 버전(web·ui 포함) ⑤ 루트 `.gitignore`·`eslint.config.mjs` ignores에 생성물(android 빌드·assets/public, src-tauri/target·gen) 추가 ⑥ 내비 정본: 모바일 하단 탭 홈·추천·통계·내번호, Windows 사이드바 8항목(DESIGN 4장), 해시 라우팅 ⑦ 완료 조건 전 사전 점검(java -version 21·ANDROID_HOME·link.exe·WebView2) — 실패 시 "차단"으로 보고
- Windows(010): updater 넣지 않음(task-035). capability 창 1개·최소 permission(core 기본, store, opener는 http·https URL만), fs 플러그인 없음. CSP `default-src 'self'; script-src 'self'; connect-src 'self' ipc: http://ipc.localhost <Supabase URL>`. 창 최소 1024×700. Rust 라이선스는 `cargo deny check licenses`(deny.toml 허용 목록, GPL·AGPL 거부) + `cargo audit`. 빌드 `pnpm tauri build --debug --no-bundle`(WiX·NSIS 다운로드 없음), Cargo.lock 커밋

## 하지 않을 것
- 설치본 서명·updater(task-035, P1), 화면 로직

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./apps/desktop tauri build --debug` 성공
- [x] `cargo audit --file apps/desktop/src-tauri/Cargo.lock` 높음 이상 0건(도구 미설치면 팀장 확인)
- [x] `grep -rn "service_role" apps/desktop` 0건
