# task-014 pension-engine: 조·자리 생성, 5조 세트

| 항목 | 내용 |
|---|---|
| 웨이브 | W2 |
| 선행 | task-012 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → tester(속성 테스트) |
| 근거 | `docs/01_PRD.md#9` 4·5 · `docs/05_DATA_MODEL.md#4` · `spec M-03` form 블록 |
| 쓰기 허용 | `packages/pension-engine/**`, 루트 `pnpm-lock.yaml` |

## 할 것
- 조 1~5/자동, 여섯 자리 각 0~9/자동, 낱장·선택 조·5조 세트, 기본번호 수, 끝자리 조건
- 출력 `digits`는 항상 6자리 문자열. 5조 세트 = 같은 여섯 자리의 1~5조 5장
- 고정 여섯 자리 + 다중 베이스 등 충돌은 `IMPOSSIBLE_COMBINATION`

- 팀장 결정(challenger 반영, 2026-11-12): ① 입력은 `PensionGeneratorConfig` 그대로(`groups` 1~5 중복 없음·1개 이상, `positions` 길이 6 각 "0"~"9" 문자열 또는 null, `games`) — types·validation 변경 없음 ② `groups`는 **확장** 의미: 베이스 번호 1개를 groups의 각 조로 발급(낱장 = 조 1개, 선택조 = 부분집합, 5조 세트 = [1,2,3,4,5]). "조 자동"은 P1(UI는 조를 고르게 함) ③ `games` = 베이스 수(최대 50), 총 장수 = games × groups 수(최대 250) — 테스트로 고정 ④ 중복 기준 = 베이스 digits. 불가능: games > 10^k(k = 자동 자리 수) → IMPOSSIBLE_COMBINATION `pension.too_few_combinations`(detail.max = 10^k) ⑤ "끝자리 조건" = positions[5](일의 자리) 고정과 같음 — 별도 조건 없음 ⑥ Rng 소비 순서: 베이스마다 positions[0](십만 자리, 왼쪽)부터 오른쪽으로 자동 자리만 nextInt(10). 10^k ≤ 10,000이면 열거 비복원 추출, 그 외 베이스 단위 전체 재추첨. 골든 벡터 두 경로 모두 + 0으로 시작하는 출력 포함, 반환 `engine_version:'pension@1'` ⑦ 입력 재검증 INVALID_INPUT(길이·값·조 범위·중복), hint `pension.*` ⑧ digits는 처음부터 문자열로만 조립(숫자 연산 금지), 카이제곱은 열거 경로 1곳

## 하지 않을 것
- 숫자형 변환·저장 로직

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./packages/pension-engine test` 통과: 속성 테스트(모든 출력 `^[0-9]{6}$`, 세트는 조 1~5·digits 동일), `000719` 고정 입력 보존
- [x] `pnpm --filter ./packages/pension-engine test -- --coverage` 리포트 생성
