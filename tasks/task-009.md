# task-009 모바일 셸 (Capacitor 8, Android 먼저)

| 항목 | 내용 |
|---|---|
| 웨이브 | W1 |
| 선행 | task-005, task-006 |
| 위험도 | 높음 |
| 보안 영향 | 의존성(Capacitor·플러그인) · 키·권한(앱 권한 선언) |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | `docs/02_ARCHITECTURE.md#1` `#2` `#5` · `docs/adr/0001-capacitor-tauri-shared-core.md` · `docs/01_PRD.md#9` 8 |
| 쓰기 허용 | `apps/mobile/**` |

## 할 것
- Vite + React + Capacitor 8(마이너는 최신 stable 확인) 셸, 하단 탭 4개(홈·추천·통계·내번호) 틀
- P0 어댑터 구현: 클립보드·공유·로컬 저장(키-값 vs SQLite는 착수 전 팀장 결정 필요, `02#5`. 인터페이스는 task-016에서 맞춤), 안전 영역·Android 백 버튼·다크모드
- Android 매니페스트에 P0에 필요 없는 권한(카메라·알림) 선언 금지

## 하지 않을 것
- 화면 로직·API 호출(`packages/*`에), iOS 빌드, 서명 키 설정(task-035)

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./apps/mobile build && pnpm --filter ./apps/mobile exec cap sync android` 성공
- [ ] `cd apps/mobile/android && ./gradlew assembleDebug` 성공
- [ ] `grep -rn "service_role" apps/mobile` 0건
