# NOW — 재진입 스냅샷 (30줄 이내, 매 작업 끝에 덮어쓴다)

- 갱신: 2026-11-13
- 현재 작업: 모바일 우선(사용자 지시) — 운세·사주 흐름. task-043a(인증 서버 설정·user_consents·계정 삭제 EF) 진행 중
- 마지막으로 한 일: 037 fortune-engine(cf10c4b) · 038 모바일 M-17 테마 번호(df5021e) · 040 fortune_profiles RLS(84f2aa2) · 인증 작업 043a/043/043b 분리
- 다음 한 걸음: 043a → 043(모바일 M-06·계정 삭제, 6자리 코드 방식) → 041(모바일 M-18·M-19, M-17 사주 링크 연결) → 046(만세력)
- 보류: Windows 026~028 `wip/task-026-028-partial`(리뷰 전), 039·042·043b(Windows 운세·인증)
- 사용자 결정(11-13): 운세 계획 기본값 5개 · 이메일+비밀번호 · 동의는 user_consents · 계정 삭제 포함 · 메일은 개발 중 로컬, 운영 메일 교체는 외부 테스트 배포 전
- 열린 결정(사용자): ② 문의처 ③ DESIGN.md 확정 표시 ④ `.env.example` 확인 ⑤ task-001 데이터 권리 ⑥ GitHub Code security ⑦ PLAN_BRIEF Q1~Q5, PRD Q6 · 계정 삭제 시 동의 이력(user_consents) 즉시 파기 vs 법정 보관(PRD#8) · design/ 와이어프레임이 기본 토큰으로 재생성된 미커밋 변경(되돌리기 권한 필요) · 12시진 저장 유지 여부(야자시/조자시 구분 없음 — 변경 원하면 041 전에)
- 열린 결정(팀장): 운영 IP 헤더 실측, 로컬 저장(KV vs SQLite), 차트 라이브러리, 워커 위치
- PR: #1 보안·규칙, #2 PC 디자인, #3 이후 전부(미머지)
- 도구: Supabase CLI `npx supabase@3.1.0`(로컬 포트 545xx, Docker), Deno `npx deno@2.9.6`
- 테스트 상태: typecheck·lint 통과 · fortune-engine 62 · ui 199 · supabase test db 601
- 담당: 팀장(Opus) · builder·challenger·codex-reviewer·reviewer
