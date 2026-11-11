# task-010 Windows 셸 (Tauri 2)

| 항목 | 내용 |
|---|---|
| 웨이브 | W1 |
| 선행 | task-005, task-006 |
| 위험도 | 높음 |
| 보안 영향 | 의존성(Tauri·Rust crate) · 키·권한(capabilities 허용 범위) |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | `docs/02_ARCHITECTURE.md#1` `#2` `#5` `#6` · `docs/adr/0001-capacitor-tauri-shared-core.md` · `docs/01_PRD.md#9` 11·12 |
| 쓰기 허용 | `apps/desktop/**` |

## 할 것
- Vite + React + Tauri 2(마이너 최신 stable 확인) 셸, 사이드바 8항목(`03` D-01 정본) 틀, 768~1199 아이콘 레일
- 창 최소 1024×700, P0 어댑터: 클립보드·앱 데이터 폴더 로컬 저장(구현체는 task-009와 같은 팀장 결정)
- capabilities는 P0 사용 API만 허용(파일 시스템은 앱 데이터 폴더 범위)

## 하지 않을 것
- 설치본 서명·updater(task-035, P1), 화면 로직

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./apps/desktop tauri build --debug` 성공
- [ ] `cargo audit --file apps/desktop/src-tauri/Cargo.lock` 높음 이상 0건(도구 미설치면 팀장 확인)
- [ ] `grep -rn "service_role" apps/desktop` 0건
