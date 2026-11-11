# NOW — 재진입 스냅샷 (30줄 이내, 매 작업 끝에 덮어쓴다)

- 갱신: 2026-11-12
- 현재 작업: 기획·디자인 보강 — 상태: 완료 (구현 전)
- 마지막으로 한 일: docs/00~05·ADR 3·REVIEW_doc(R1~R25)·화면 34·와이어프레임·토큰·tasks 36개·README 진행 현황
- 다음 한 걸음: task-001(데이터 권리, 사용자 확인) · task-002(/secure setup L2)
- 열린 결정(사용자 확인 필요): PLAN_BRIEF Q1~Q5 (Next.js 유지는 가정), PRD#7 Q6 유료 생성 한도
- 열린 결정(팀장): 로컬 저장(KV vs SQLite, task-009 전), 레이트리밋 구현, A-06 window·metric 값, 연금 보너스 표기, 커버리지 기준, 워커 위치·CI·웹 호스팅, 차트 라이브러리
- 주의: task-004(Next.js 랜딩)가 task-005(모노레포)보다 먼저 — 005에서 apps/web 편입. 와이어프레임은 저해상도, 고해상도 시안 미작성
- SDLC 단계: 05 기술설계 완료 → 01 검증(린) 실행 전
- 담당 모델/역할: 팀장(Opus) · planner·designer·codex-designer·diagrammer·reviewer
- 수정 파일: README.md, AGENTS.md, DESIGN.md, docs/**, design/**, packages/design-tokens/**, tasks/**
- 테스트 상태: 미실행(코드 없음). plan2spec 🔴 0, mmd-check 전부 통과, 대비 검사 통과
- 남은 작업: tasks/README.md W0~W6
