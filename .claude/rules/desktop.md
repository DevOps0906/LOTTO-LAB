---
paths:
  - "apps/desktop/**"
---
# Windows 영역 규칙 (apps/desktop/** — Tauri 2 작업 때만 로드)
- capability는 창별 최소 명령만. 파일 접근은 앱 데이터 폴더와 대화상자로 고른 경로만, shell 플러그인은 sidecar만.
- CSP: `script-src 'self'`(인라인 스크립트 금지), `connect-src`는 Supabase·업데이트 서버만.
- Rust 명령(IPC) 인자는 모두 검증한다(경로 정규화·길이·형식).
- 업데이트 서명 키·코드 서명 인증서는 CI 비밀로만. `Cargo.lock` 커밋, `cargo audit`을 CI에 넣는다.
- 로그·크래시 리포트에 토큰·개인정보를 남기지 않는다.
