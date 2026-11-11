# task-015 statistics: 기본 통계 계산

| 항목 | 내용 |
|---|---|
| 웨이브 | W2 |
| 선행 | task-011 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → tester |
| 근거 | `docs/04_API.md#1` A-06 · `docs/05_DATA_MODEL.md#2` statistics_cache · `docs/01_PRD.md#6` · `spec M-04` chart·stat 블록 |
| 쓰기 허용 | `packages/statistics/**` |

## 할 것
- 로또: 빈도·미출현·홀짝·합계·구간 / 연금: 조별 분포·자리별 0~9·끝자리, 기간 최근 20/50/100/전체
- 모든 결과에 `range_from·range_to·sample_size` 포함(무작위 기준선 값 포함)
- `window`·`metric` 허용 값 목록은 팀장 결정 필요(A-06) — 결정 전에는 `spec M-04` filter 항목만

## 하지 않을 것
- 예측·추천 점수 산출, 워커 쪽 구현(task-030은 이 결과와 대조)

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/statistics test` 통과(고정 입력 → 기대 결과 골든 파일, 표본 0 처리)
- [ ] 골든 파일을 `packages/statistics/fixtures/`에 두어 task-030에서 재사용 가능
