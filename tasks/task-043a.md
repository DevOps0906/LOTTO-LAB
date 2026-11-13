# task-043a 인증 서버 설정·동의 기록·계정 삭제 (Supabase, P1)

| 항목 | 내용 |
|---|---|
| 웨이브 | W7(P1) |
| 선행 | task-008, task-040 |
| 위험도 | 높음 (인증·RLS·service_role Edge Function) |
| 보안 영향 | 인증 설정 · 개인정보(동의 기록) · service_role 사용 면 |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | `tasks/task-043.md` 팀장 결정 ①④⑤⑦⑧ · `docs/05_DATA_MODEL.md#2·#3` · `docs/04_API.md` · `docs/adr/0003-supabase-rls-edge-function.md` · `.claude/rules/db.md`·`api.md` |
| 쓰기 허용 | `supabase/config.toml`(auth 절) · `supabase/templates/**`(메일 템플릿) · `supabase/migrations/**`(새 번호 파일만) · `supabase/tests/**` · `supabase/functions/account-delete/**`·`_shared/**`(필요 시) · `supabase/README.md`(운영 대시보드 점검표) · `docs/05_DATA_MODEL.md`·`docs/04_API.md`(새 행) · `docs/diagrams/erd.mmd` |

## 할 것
- config.toml: `enable_confirmations = true`, 비밀번호 최소 8자·`letters_digits`, `secure_password_change = true`, 메일 재발송 `max_frequency = "60s"`, 가입 확인·재설정 템플릿은 6자리 코드(`{{ .Token }}`)만 — 링크 없음
- `user_consents`(user_id FK auth.users CASCADE, terms_version text, privacy_version text, adult_confirmed boolean CHECK true, consented_at DEFAULT now()) — 본인 SELECT·INSERT만(UPDATE·DELETE 없음), consented_at·user_id 위조 불가(열 GRANT·WITH CHECK)
- Edge Function `account-delete`(A-20): JWT 필수 → 본인 auth 사용자 삭제(service_role은 함수 안에서만) → CASCADE로 fortune_profiles·user_consents·user_data 파기. 멱등, 429
- supabase/README.md에 운영 대시보드 Auth 설정 점검표(config.toml과 같은 값) 추가 — 운영 반영은 사람이 함

## 하지 않을 것
- 적용된 마이그레이션 수정 · 운영 프로젝트에 직접 반영 · 운영 메일(SMTP) 설정

## 완료 조건 (실행 가능한 확인)
- [x] `npx supabase@3.1.0 db reset` 성공 + `test db` 전체 통과(user_consents RLS: 타인 0행·쓰기 42501·UPDATE/DELETE 거부·anon 거부·CASCADE)
- [x] `npx deno@2.9.6 test` account-delete 단위 테스트 + 로컬 통합(본인만 삭제·타인 토큰 불가·JWT 없음 401)
- [x] 로컬 가입 시 확인 메일 본문에 6자리 코드만 있고 링크가 없음(로컬 메일 서버 API로 확인)
