# NOW — 재진입 스냅샷 (30줄 이내, 매 작업 끝에 덮어쓴다)

- 갱신: 2026-11-12
- 현재 작업: W3 화면 — task-017 모바일 M-05·M-01·M-15 진행 (브랜치 `dev/fortune-and-w0`, PR #3)
- 마지막으로 한 일: 011 types·Zod(DB 동치 벡터) · 012 lottery-core · 013·014 로또·연금 엔진 · 015 통계 정본 · 016 app-core · 009·010 모바일·Windows 셸(디버그 APK·exe) · 광고 기획 ADR-0006·task-045
- 다음 한 걸음: 017 → 018·019(생성) → 020(통계) → 021(회차) → 022·023(내 번호·구매등록·설정) → Windows 024~028 → 워커 029~031
- 열린 결정(사용자): ① 운영 메일 서비스 ② 문의처 ③ DESIGN.md 확정 표시 ④ 루트 `.env.example`·apps/web/.env.example 확인 ⑤ task-001 데이터 권리(연금 등위+보너스 동시 당첨 규정 포함) ⑥ GitHub Code security 설정 ⑦ PLAN_BRIEF Q1~Q5, PRD Q6
- 열린 결정(팀장): 운영 IP 헤더 실측(supabase/README 배포 체크리스트), 로컬 저장(KV vs SQLite), 차트 라이브러리, 워커 위치
- PR: #1 보안·규칙, #2 PC 디자인, #3 이후 전부(미머지). 미완 보관 브랜치 `wip/task-009-011-partial`은 이제 불필요(011·009 완료) — 삭제 가능
- 도구: Supabase CLI `npx supabase@3.1.0`(로컬 포트 545xx), Deno `npx deno@2.9.6`, Docker 필요
- 테스트 상태: pnpm typecheck·lint·test·build 전부 통과(app-core 49·lotto 30·pension 36·lottery-core 49·statistics 20·validation 148·ui 61·web 17·mobile·desktop) · supabase test db 548 · deno 39(통합 43)
- 담당: 팀장(Opus) · builder·challenger·codex-reviewer·reviewer·planner·designer·diagrammer
