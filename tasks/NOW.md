# NOW — 재진입 스냅샷 (30줄 이내, 매 작업 끝에 덮어쓴다)

- 갱신: 2026-11-13
- 현재 작업: 다음 = task-041(모바일 M-18·M-19 사주 프로필·번호, M-17 사주 링크 연결) — 위험도 높음(challenger 착수 전)
- 마지막으로 한 일: task-043 완료(M-06 로그인·가입·재설정·계정 삭제, 동의 게이트·약관 버전 재동의, 리뷰 🔴1·🟡5 반영)
- 출시: Google Play 위주(사용자 11-13). 앱인토스 보류(ADR-0007) — ui·app-core는 supabase/Capacitor 직접 import 금지, 플랫폼 차이는 어댑터로
- 다음 한 걸음: 041 → 046(만세력) → 043b(Windows 인증)
- 커밋 제외 유지: design/**(와이어프레임 재생성 — 열린 사용자 결정)
- 보류: Windows 026~028 `wip/task-026-028-partial`, 039·042·043b
- 열린 결정(사용자): ② 문의처 ③ DESIGN.md 확정 ④ .env.example ⑤ task-001 데이터 권리 ⑥ GitHub Code security ⑦ PLAN_BRIEF Q1~Q5, PRD Q6 · 계정 삭제 시 user_consents 파기 vs 보관 · design/ 미커밋 재생성 되돌리기 · 12시진 저장 유지(041 전에)
- 통합 테스트: `npx supabase@3.1.0 functions serve`(백그라운드, supabase/functions/.env gitignored 로컬값 RATE_SALT·ALLOWED_ORIGIN — Windows에서 가끔 docker.env 경로 오류, 재시도하면 뜸) → `AUTH_IT=1 VITE_SUPABASE_PUBLISHABLE_KEY=<status -o env> pnpm --filter @lotto-lab/mobile exec vitest run test/auth.integration.test.ts`
- 도구: Supabase CLI `npx supabase@3.1.0`(로컬 545xx, Docker), Deno `npx deno@2.9.6`. secscan license는 pnpm lock 라이선스 해석 불가 → node_modules package.json으로 직접 확인
- 테스트 상태: typecheck·lint·test 통과(app-core 109), mobile build 통과, 인증 통합 테스트 통과
- 담당: 팀장(Opus) · builder · codex-reviewer · reviewer · challenger
