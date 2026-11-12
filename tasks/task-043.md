# task-043 로그인·가입·재설정 (Supabase Auth, P1)

| 항목 | 내용 |
|---|---|
| 웨이브 | W7(P1) |
| 선행 | task-008, task-017 |
| 위험도 | 높음 (challenger 착수 전 검토 — 인증) |
| 보안 영향 | 인증 · 세션 토큰 저장(`.claude/rules/mobile.md`: Keychain/Keystore·PKCE) · OAuth Redirect URL |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | `spec M-06` · `docs/01_PRD.md#3` 로그인·클라우드 동기화 · `docs/01_PRD.md#8` · `docs/adr/0005-fortune-numbers.md`(사주 번호 회원 전용) |
| 쓰기 허용 | `packages/ui/src/screens/M-06/**`, `packages/app-core/src/auth/**`, `apps/mobile/**`·`apps/desktop/**`의 인증 어댑터 |

## 할 것
- 이메일(매직 링크 또는 비밀번호) 로그인·가입·재설정, 로그인 후 원래 작업 복귀(사주 번호 진입 포함)
- 세션은 기기 보안 저장소에만, PKCE, Windows는 시스템 브라우저 + 앱 링크 복귀

## 하지 않을 것
- 소셜 로그인 공급자 추가(별도 결정), 클라우드 동기화 병합 로직

## 완료 조건 (실행 가능한 확인)
- [ ] 로컬 Supabase에서 가입→로그인→로그아웃→재설정 통합 테스트 통과
- [ ] 비로그인 상태로 사주 화면(M-18) 진입 시 M-06으로 이동하고 로그인 후 복귀
