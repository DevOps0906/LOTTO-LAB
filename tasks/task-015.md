# task-015 statistics: 기본 통계 계산

| 항목 | 내용 |
|---|---|
| 웨이브 | W2 |
| 선행 | task-011 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → tester |
| 근거 | `docs/04_API.md#1` A-06 · `docs/05_DATA_MODEL.md#2` statistics_cache · `docs/01_PRD.md#6` · `spec M-04` chart·stat 블록 |
| 쓰기 허용 | `packages/statistics/**`, `packages/types/src/constants.ts`·`packages/types/src/draws.ts`(통계 키), `packages/validation/src/draws.ts`(Zod enum)·해당 테스트, 루트 `pnpm-lock.yaml` |

## 할 것
- 로또: 빈도·미출현·홀짝·합계·구간 / 연금: 조별 분포·자리별 0~9·끝자리, 기간 최근 20/50/100/전체
- 모든 결과에 `range_from·range_to·sample_size` 포함(무작위 기준선 값 포함)
- `window`·`metric` 허용 값 목록은 팀장 결정 필요(A-06) — 결정 전에는 `spec M-04` filter 항목만

- 팀장 결정(challenger 반영, 2026-11-12): ① 역할: 이 패키지는 통계 계산의 **정본·골든 기준**. P0 앱은 런타임에 계산하지 않고 `statistics_cache`만 읽는다(DF-4). 워커(task-030, Python)는 같은 골든 파일로 결과를 맞춘다 ② 키 단일화: `@lotto-lab/types`에 `STAT_WINDOWS = ['last10','last20','last50','last100','all']`(last10은 홈 요약용)·`STAT_METRICS = ['lotto.number_freq','lotto.number_freq_bonus','lotto.range_dist','lotto.odd_even','lotto.sum_dist','lotto.gap','pension.digit_freq','pension.group_freq','pension.bonus_digit_freq']` 상수 + validation Zod enum(쓰기 허용에 types·validation 추가). "보너스 포함"은 metric 키로 구분 ③ 기준선 공식(지표별): 번호 빈도 = 표본×6/45(보너스 포함 ×7/45), 구간 = 표본×6×구간 크기/45(1~10·11~20·21~30·31~40=10, 41~45=5), 홀짝 = 회차당 홀수 개수 k의 초기하분포 C(23,k)·C(22,6−k)/C(45,6), 합계 = C(45,6) 정확 분포(DP, 평균 138), 미출현 = 기대 간격 45/6, 연금 자리 숫자 = 표본/10, 조 = 표본/5 ④ payload 정본 형식: 부동소수 금지 — 횟수는 정수 배열(인덱스 = 번호−1 등 지표별 명시), 기준선은 정수 분수 `{num, den}`(기약분수), 키는 고정 허용 목록. 골든 파일(`packages/statistics/test/golden/*.json`)은 비교 시 파싱 후 구조 비교 ⑤ 기간: "최근 N회" = 존재하는 회차 중 draw_no 내림차순 N개, 미출현 간격 = draw_no 차이, 기간 안 미출현 번호는 `gap:null, censored:true`(≥ 기간 길이). 표본 0이면 결과 없음(캐시 행 미생성 → A-06 0행 = 미갱신) ⑥ 범위 밖: draw_no 범위 입력, "이전 동일 기간 대비"(P1), 유의성 검정(P1) ⑦ 예측 오해 방지: 결과는 번호 순서로만(정렬·순위·hot/cold/due 같은 키 금지 — 허용 키 목록 테스트), 표본 적음 표시는 UI(표본 < 50이면 "표본 적음")

## 하지 않을 것
- 예측·추천 점수 산출, 워커 쪽 구현(task-030은 이 결과와 대조)

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/statistics test` 통과(고정 입력 → 기대 결과 골든 파일, 표본 0 처리)
- [ ] 골든 파일을 `packages/statistics/fixtures/`에 두어 task-030에서 재사용 가능
