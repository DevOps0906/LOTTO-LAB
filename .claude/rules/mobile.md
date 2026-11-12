---
paths:
  - "apps/mobile/**"
---
# 모바일 영역 규칙 (apps/mobile/** — Capacitor 8 작업 때만 로드)
- `capacitor.config`: `server.url`은 개발 빌드에서만, 운영은 `cleartext: false`·`androidScheme: "https"`. 릴리스 빌드는 WebView 원격 디버깅 끔.
- 외부 사이트·OAuth는 시스템 브라우저(`@capacitor/browser`)로 연다. 앱 WebView에 원격 페이지를 띄우지 않는다.
- 세션 토큰은 Keychain/Keystore 보안 저장소에만. Preferences에는 비민감 설정만. 인증은 PKCE, `detectSessionInUrl: false`.
- Supabase Redirect URL에는 앱 스킴·App Link를 와일드카드 없이 정확히 등록한다.
- 로그·크래시 리포트에 토큰·이메일 등 개인정보를 남기지 않는다. 권한 판정은 서버(RLS)가 하며 루팅·탈옥 탐지에 의존하지 않는다.
- 배포는 스토어만(OTA 미사용). OTA를 도입하면 화면 번들만, 서명 검증·실패 시 롤백 필수.
