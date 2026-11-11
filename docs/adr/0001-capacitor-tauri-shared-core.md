# ADR-0001 모바일 Capacitor + Windows Tauri, 두 셸이 코드를 공유한다

- 상태: 채택
- 날짜: 2026-11-12

| 항목 | 내용 |
|---|---|
| 맥락 | 모바일 앱(Android 먼저, iOS)과 Windows 설치형을 함께 내야 한다(D1). 모바일은 하단 탭, Windows는 사이드바 대시보드로 레이아웃이 다르다(D2). 1인·소규모 팀이 두 벌의 화면 로직을 유지할 수 없다. |
| 선택 | 모바일 `apps/mobile` = Vite + React + Capacitor 8, Windows `apps/desktop` = Vite + React + Tauri 2(MSI/NSIS). 화면 컴포넌트 `packages/ui`, 상태·API·화면 로직 `packages/app-core`, 엔진·통계·검증·타입 패키지를 공유하고 **레이아웃 셸만 앱별**로 둔다(D3). 네이티브 기능은 `app-core`의 어댑터 인터페이스로 추상화하고 셸이 구현을 주입한다. 버전은 착수 시 최신 stable 확인. |
| 대안 | ① Capacitor 단일 셸 + Electron: 설치 크기·메모리가 커서 기각. ② Windows도 Capacitor: Windows 데스크톱 공식 플랫폼이 아니어서 기각(착수 시 재확인). ③ React Native + RN Windows: 웹(Next.js)과 컴포넌트 공유가 어려워 기각. ④ Flutter: TS 엔진·Zod 스키마 재사용 불가로 기각. |
| 결과 | 얻음: 화면 로직·엔진 1벌, 웹과도 패키지 공유. 잃음: 두 네이티브 런타임(Android/iOS 도구 + Rust/WebView2) 빌드 체인 유지, 플랫폼 차이는 어댑터로만 흡수. 되돌리기: 셸 교체는 `apps/*`만 바꾸면 되어 비용 중간, 공유 패키지는 유지. |

- 관련: [02_ARCHITECTURE.md#1·#2·#5](../02_ARCHITECTURE.md)
