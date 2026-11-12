# NOW — 재진입 스냅샷 (30줄 이내, 매 작업 끝에 덮어쓴다)

- 갱신: 2026-11-12
- 현재 작업: 일시 중단(사용자 요청) — W1 완료. task-009·010·011은 결정 기록까지 커밋, 구현은 미완 (PR #3 브랜치 `dev/fortune-and-w0`)
- 마지막으로 한 일: 모노레포(TS 6.0.3·turbo·경계 lint), 공유 UI 블록·오버레이(토스트·스낵바 등, nomad-design-modules 기준), 공개·사용자 DB 스키마(RLS·열 권한·트리거), Dependabot
- 다음 한 걸음: task-011 재개 — `wip/task-009-011-partial` 브랜치(미검증 일부 코드: types·validation·catalog, frozen install·typecheck 실패)를 이어 쓰거나 버리고 task-011.md 결정대로 새로. 이어서 task-009·010(결정은 각 task 파일), 012·013
- 열린 결정(사용자): ① 운영 메일 서비스 ② 문의처 ③ DESIGN.md 확정 표시 ④ 루트 `.env.example`·apps/web/.env.example 확인 ⑤ task-001 데이터 권리(연금 등위+보너스 동시 당첨 규정 포함) ⑥ GitHub Code security 설정 ⑦ PLAN_BRIEF Q1~Q5, PRD Q6
- 열린 결정(팀장): 운영 IP 헤더 실측(supabase/README 배포 체크리스트), 로컬 저장(KV vs SQLite), 차트 라이브러리, 워커 위치
- PR: #1 보안·규칙, #2 PC 디자인(미머지). 이 브랜치는 둘을 합친 위에서 작업
- 도구: Supabase CLI `npx supabase@3.1.0`(로컬 포트 545xx), Deno `npx deno@2.9.6`, Docker 필요
- 테스트 상태: supabase test db 450/450 · deno 단위 39(통합 43) · pnpm typecheck·lint·test(ui 61·tokens 25·web 17)·build 통과
- 담당: 팀장(Opus) · builder·challenger·codex-reviewer·reviewer·planner·designer·diagrammer
