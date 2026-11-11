# task-029 수집 워커: 공식 회차 수집·검증·UPSERT

| 항목 | 내용 |
|---|---|
| 웨이브 | W5 |
| 선행 | task-001(결과 "허용·조건부"일 때만), task-007 |
| 위험도 | 높음 (challenger 착수 전 검토) |
| 보안 영향 | 키·권한(service_role) · 의존성(Python 패키지) · 외부 입력(수집 데이터) |
| 담당 | builder → tester → codex-reviewer(code) + reviewer(security) |
| 근거 | `docs/02_ARCHITECTURE.md#3` DF-3 · `docs/05_DATA_MODEL.md#5` · `docs/diagrams/flow-ingest.mmd` · `docs/01_PRD.md#5` 데이터 정합성 |
| 쓰기 허용 | `services/analytics-worker/**` (수집 모듈) |

## 할 것
- 수집 → `ingestion_runs`(raw_payload·sha256) 기록 → 범위·중복·회차/날짜·연금 6자리 문자열 검증 → 통과만 `draws_*` UPSERT(출처·검증 시각), 실패는 `needs_review`·발송 중단
- service_role은 환경 변수로만 읽기, 로그에 키·원본 응답 전체 출력 금지, 요청 간격·User-Agent는 Q1 조건 따름
- 실행 위치·주기는 팀장 결정 필요(`02#6`)

## 하지 않을 것
- 통계 재계산(task-030), 검증 실패 데이터 반영

## 완료 조건 (실행 가능한 확인)
- [ ] `pytest services/analytics-worker` 통과(저장된 응답 픽스처로 정상·범위 위반·중복·`719` 문자열 손실 케이스)
- [ ] 로컬 Supabase 대상 1회 실행 후 `supabase test db`로 실패 케이스가 `draws_*`에 없음 확인
- [ ] `~/.claude/nomad/bin/secscan` 통과
