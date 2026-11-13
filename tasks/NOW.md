# NOW — 재진입 스냅샷 (30줄 이내, 매 작업 끝에 덮어쓴다)

- 갱신: 2026-11-13
- 현재 작업: task-045(AdMob) 구현 완료·미커밋. 보안 리뷰 🔴0·🟡3(동의 전 SDK 자동 초기화 — DELAY_APP_MEASUREMENT_INIT/MobileAdsInitProvider 제거 검토, 릴리스 ADMOB_APP_ID 비면 Gradle 실패, capacitor.build.gradle의 secure-storage는 043 cap sync 누락분 명시). 코드 리뷰는 서브에이전트 API 403(/login 필요)으로 3회 실패 — 재로그인 후 재실행
- 마지막으로 한 일: task-047 모바일 M-01~M-04 시안 정합 커밋·푸시(b2cd5f3, 768+ 픽셀 불변). 사용자 확인 대기: 홈 요약 순위→번호 순서 여부, 연금 당첨 구조 출처 문구. 별건: validation inputs.test REAUTH_REQUIRED 표 불일치(HEAD부터, turbo 캐시가 가림 — `turbo --force`로 확인). 로컬 DB statistics_cache에 source="LOCAL 합성 집계" 3행(확인용, 지워도 됨)
- 출시: Google Play 위주(사용자 11-13). 앱인토스 보류(ADR-0007) — ui·app-core는 supabase/Capacitor 직접 import 금지, 플랫폼 차이는 어댑터로
- 다음 한 걸음: 046 → 043b(Windows 인증) → 042(Windows 사주)
- 커밋 제외 유지: design/**(와이어프레임 재생성 — 열린 사용자 결정)
- 보류: Windows 026~028 `wip/task-026-028-partial`, 039·042·043b
- 열린 결정(사용자): ② 문의처 ③ DESIGN.md 확정 ④ .env.example ⑤ task-001 데이터 권리 ⑥ GitHub Code security ⑦ PLAN_BRIEF Q1~Q5, PRD Q6 · 계정 삭제 시 user_consents 파기 vs 보관 · design/ 미커밋 재생성 되돌리기 · KASI 음양력 API 서비스 키(046 골든 데이터) · 개인정보 처리방침 URL(출시 차단)
- 통합 테스트: `npx supabase@3.1.0 functions serve`(백그라운드, supabase/functions/.env gitignored 로컬값 RATE_SALT·ALLOWED_ORIGIN — Windows에서 가끔 docker.env 경로 오류, 재시도하면 뜸) → `AUTH_IT=1 VITE_SUPABASE_PUBLISHABLE_KEY=<status -o env> pnpm --filter @lotto-lab/mobile exec vitest run test/auth.integration.test.ts`
- 도구: Supabase CLI `npx supabase@3.1.0`(로컬 545xx, Docker), Deno `npx deno@2.9.6`. secscan license는 pnpm lock 라이선스 해석 불가 → node_modules package.json으로 직접 확인
- 테스트 상태: typecheck·lint·test 통과(app-core 127·ui 247·mobile 41), mobile build 통과, 인증 통합 테스트 통과
- 담당: 팀장(Opus) · builder · codex-reviewer · reviewer · challenger
