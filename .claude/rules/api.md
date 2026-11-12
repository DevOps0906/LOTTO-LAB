---
paths:
  - "supabase/functions/**"
---
# API 영역 규칙 (supabase/functions/** — Edge Function `/v1/*` 작업 때만 로드)
- 먼저 `~/.claude/skills/stack-supabase/SKILL.md`를 읽는다. 구조 근거: `docs/adr/0003-supabase-rls-edge-function.md`.
- 함수는 판정·관리자·waitlist만. 공개 읽기·사용자 CRUD는 RLS 직접 접근이며 함수로 우회하지 않는다.
- service_role·Turnstile secret 등 서버 키는 함수 환경변수에만. 응답·로그에 내부 키·원본 DB 오류를 노출하지 않는다.
- 관리자 엔드포인트는 MFA(TOTP) 확인 후에만(`docs/04_API.md#5`). 불가능한 조건은 409 + 해결 안내.
- 응답 형식이 바뀌면 `docs/04_API.md` 해당 행과 `packages` 타입·Zod 스키마를 같은 작업에서 맞춘다.
- 필수 환경변수(service_role·Turnstile secret)가 없으면 요청 처리 전에 실패시킨다. 정기 작업은 워커·pg_cron으로 하고 공개 라우트+`CRON_SECRET` 방식은 쓰지 않는다.
