# NOW — 재진입 스냅샷 (30줄 이내, 매 작업 끝에 덮어쓴다)

- 갱신: 2026-11-12
- 현재 작업: task-003 사전알림 백엔드 — 상태: 완료 (브랜치 `dev/fortune-and-w0`)
- 마지막으로 한 일: waitlist 테이블(REVOKE·CHECK)·레이트리밋(DB 카운터)·pg_cron 2개·EF A-15·테스트(pgTAP 22, Deno 단위 22 + 통합 2). 운세·테마 번호 기획(ADR-0005, task-037~043), 사전알림 수신 거부·발송 후 파기(task-044), PC 시안(task-006a 완료)
- 다음 한 걸음: task-004 웹 랜딩 W-01 + 사전알림 폼 (Next.js, apps/web)
- 열린 결정(사용자): ① 사전알림 이메일 이중 확인(확인 메일) 여부 ② `.env.example` 생성(권한 차단으로 사용자 작성) ③ task-001 데이터 권리 ④ PLAN_BRIEF Q1~Q5, PRD Q6
- 열린 결정(팀장): 운영 IP 헤더 실측(supabase/README 배포 체크리스트), 로컬 저장(KV vs SQLite), 차트 라이브러리, 워커 위치
- PR: #1 보안·규칙, #2 PC 디자인(미머지). 이 브랜치는 둘을 합친 위에서 작업
- 도구: Supabase CLI `npx supabase@3.1.0`(로컬 포트 545xx), Deno `npx deno@2.9.6`, Docker 필요
- 테스트 상태: `npx supabase@3.1.0 test db` 22/22 · `deno test supabase/functions/waitlist/` 24/24(통합은 WAITLIST_IT_URL·WAITLIST_IT_SERVICE_KEY 필요)
- 담당: 팀장(Opus) · builder·challenger·codex-reviewer·reviewer·planner·designer·diagrammer
