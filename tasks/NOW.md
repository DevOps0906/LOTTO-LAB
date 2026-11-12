# NOW — 재진입 스냅샷 (30줄 이내, 매 작업 끝에 덮어쓴다)

- 갱신: 2026-11-12
- 현재 작업: task-005 모노레포 착수 전 — 직전 완료 task-003b(이중 확인)·task-004(웹 랜딩) (브랜치 `dev/fortune-and-w0`, PR #3)
- 마지막으로 한 일: waitlist 테이블(REVOKE·CHECK)·레이트리밋(DB 카운터)·pg_cron 2개·EF A-15·테스트(pgTAP 22, Deno 단위 22 + 통합 2). 운세·테마 번호 기획(ADR-0005, task-037~043), 사전알림 수신 거부·발송 후 파기(task-044), PC 시안(task-006a 완료)
- 다음 한 걸음: task-005 모노레포(pnpm workspaces + Turborepo, apps/web 편입) → task-002 마무리(`/secure setup`으로 Dependabot)
- 열린 결정(사용자): ① 운영 메일 서비스 ② 문의처(메일·푸터·W-05) ③ DESIGN.md 확정 표시 ④ `.env.example`(루트) 작성·apps/web/.env.example 값 비었는지 확인 ⑤ task-001 데이터 권리 ⑥ PLAN_BRIEF Q1~Q5, PRD Q6
- 열린 결정(팀장): 운영 IP 헤더 실측(supabase/README 배포 체크리스트), 로컬 저장(KV vs SQLite), 차트 라이브러리, 워커 위치
- PR: #1 보안·규칙, #2 PC 디자인(미머지). 이 브랜치는 둘을 합친 위에서 작업
- 도구: Supabase CLI `npx supabase@3.1.0`(로컬 포트 545xx), Deno `npx deno@2.9.6`, Docker 필요
- 테스트 상태: supabase test db 50/50 · deno test supabase/functions/ 단위 39(Mailpit 통합 포함 43) · apps/web typecheck·test 17·build 통과
- 담당: 팀장(Opus) · builder·challenger·codex-reviewer·reviewer·planner·designer·diagrammer
