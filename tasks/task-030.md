# task-030 워커: 통계 캐시 재계산

| 항목 | 내용 |
|---|---|
| 웨이브 | W5 |
| 선행 | task-015, task-029 |
| 위험도 | 보통 |
| 보안 영향 | 없음 (task-029의 서버 키 경로 재사용, 키·권한 변경 없음) |
| 담당 | builder → tester |
| 근거 | `docs/02_ARCHITECTURE.md#3` DF-3 · `docs/05_DATA_MODEL.md#2` statistics_cache · `docs/04_API.md#1` A-06 |
| 쓰기 허용 | `services/analytics-worker/**` (통계 모듈) |

## 할 것
- 새 회차 UPSERT 또는 A-12 승인 후 `statistics_cache` 재계산(window·metric 조합, `range_from·range_to·sample_size·source·updated_at`)
- 결과가 TS `packages/statistics`와 같아야 함 — 같은 골든 파일로 대조

## 하지 않을 것
- 새 지표 추가, 예측 점수

## 완료 조건 (실행 가능한 확인)
- [ ] `pytest services/analytics-worker -k statistics` 통과(`packages/statistics/fixtures/` 골든 파일과 일치)
- [ ] 검증 실패 회차가 있으면 재계산하지 않음을 테스트로 확인
