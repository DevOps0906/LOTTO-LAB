# task-043 모바일 로그인·가입·재설정·계정 삭제 (Supabase Auth, P1)

| 항목 | 내용 |
|---|---|
| 웨이브 | W7(P1) |
| 선행 | task-008, task-017, task-043a |
| 위험도 | 높음 (challenger 착수 전 검토 — 인증) |
| 보안 영향 | 인증 · 세션 토큰 저장(`.claude/rules/mobile.md`: Keychain/Keystore·PKCE) · OAuth Redirect URL |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | `spec M-06` · `docs/01_PRD.md#3` 로그인·클라우드 동기화 · `docs/01_PRD.md#8` · `docs/adr/0005-fortune-numbers.md`(사주 번호 회원 전용) |
| 쓰기 허용 | `packages/ui/src/screens/M-06/**`·`M-12/**`(계정 삭제)·`packages/ui/src/index.ts`·해당 테스트, `packages/app-core/src/auth/**`·`index.ts`·`adapters.ts`(AuthClient 인터페이스), `apps/mobile/**`(인증 어댑터·보안 저장소·라우트), `pnpm-lock.yaml` |

- 사용자 결정(2026-11-13): 이메일+비밀번호(매직 링크 없음) · 메일은 당분간 Supabase 기본 메일(출시 전 운영 메일 서비스로 교체 — 열린 결정 ① 유지)

- 팀장 결정(2026-11-13, challenger 반영): ① 메일 링크 복귀(딥링크·PKCE 교환) 대신 **6자리 코드 입력**(`verifyOtp` type signup·recovery) — 링크 가로채기·메일 스캐너 선소모·다른 기기 열기 문제 제거, 딥링크·intent-filter 없음 ② 새 의존성: `@supabase/supabase-js`(apps/mobile만, app-core는 `AuthClient` 인터페이스) + Capacitor 보안 저장소 플러그인 1개(Capacitor 8 peer 지원·`secscan license` 확인 후 선택, iOS는 ThisDeviceOnly·iCloud 동기화 없음) — `auth.storage`로 주입, persistSession true, detectSessionInUrl false ③ 클라이언트 1개, 앱 전·후면 전환에 startAutoRefresh/stopAutoRefresh, 보안 저장소 복호화 실패는 로그아웃 상태로 처리, signOut은 `scope: 'local'`도 확실히 지움 ④ 오류 문구 통일: 로그인 실패·미확인·이미 가입은 같은 문구, 재설정 요청은 항상 같은 응답(이메일 열거 방지) ⑤ 비밀번호 8자 이상·영문+숫자(서버 설정과 같은 규칙을 Zod로) ⑥ 복귀 경로 returnTo는 기기 메모리에만, 허용 경로 화이트리스트 ⑦ 가입 시 약관·개인정보·만 19세 동의 → task-043a `user_consents` 기록 ⑧ M-12 계정 삭제(확인 모달 → task-043a Edge Function → 로컬 세션 삭제) ⑨ Windows는 task-043b
- 사용자 결정(2026-11-13): 이메일+비밀번호 · 메일은 개발 중 로컬 메일 서버, 운영 메일 교체는 외부 테스트 배포 전(선행 조건) · 동의는 서버 테이블 `user_consents` · 계정 삭제를 이번 범위에 포함

## 할 것
- M-06 탭 3개(로그인·가입·재설정) — 가입·재설정은 이메일 → 6자리 코드 → (재설정은 새 비밀번호) 2단계
- app-core AuthService(signUp·verify·signIn·signOut·requestReset·confirmReset·deleteAccount·세션 구독)
- 로그인 후 원래 화면 복귀(사주 진입 가드는 task-041이 사용)

## 하지 않을 것
- 소셜 로그인, 매직 링크, 딥링크 복귀, 클라우드 동기화 병합(M-14), 로그인 전 로컬 번호 전송

## 완료 조건 (실행 가능한 확인)
- [ ] 로컬 Supabase 통합 테스트: 가입→메일 코드 확인(로컬 메일 서버 API로 코드 읽기)→로그인→로그아웃→재설정→새 비밀번호 로그인→계정 삭제 후 로그인 실패
- [ ] app-core 단위 테스트: 오류 문구 통일·비밀번호 규칙·returnTo 화이트리스트·복호화 실패 시 로그아웃 상태
- [ ] ui M-06 테스트, `pnpm --filter @lotto-lab/mobile build`, 루트 typecheck·lint·test, `secscan license` 통과
