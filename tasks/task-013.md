# task-013 lotto-engine: 자동/반자동 생성

| 항목 | 내용 |
|---|---|
| 웨이브 | W2 |
| 선행 | task-012 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → tester(속성 테스트) |
| 근거 | `docs/01_PRD.md#9` 1·2·3 · `docs/adr/0002-engine-on-device.md` · `spec M-02` form 블록(조건 범위) |
| 쓰기 허용 | `packages/lotto-engine/**`, `packages/lottery-core/src/errors.ts`(detail 추가)·해당 테스트, 루트 `pnpm-lock.yaml` |

## 할 것
- 고정 0~6·제외 0~39·게임 수 1~50, 고정/제외 겹침·남은 수 부족은 즉시 `IMPOSSIBLE_COMBINATION`(무한 대기 금지, 시도 상한)
- 결과 각 게임 6개 정수 1~45 중복 없음·오름차순, `engine_version` 반환
- 고급 조건(구간·홀짝·합계·연속)은 P1 — 인터페이스 자리만

- 팀장 결정(challenger 반영, 2026-11-12): ① P0 조건은 고정·제외·게임 수만 — 홀짝·합계·연속 필터는 P1(입력 타입에 자리 없음, 이번에 구현·노출 안 함). 판정은 정확 계산: p=후보 수(45−고정−제외), k=6−고정, 가능 조합 C(p,k) ② 반환 `{games, engine_version:'lotto@1'}` — 같은 Rng 시드·같은 입력의 출력이 바뀌는 변경은 버전을 올린다(골든 벡터 테스트가 강제) ③ 한 배치 안 게임 중복 금지가 기본(옵션 없음). games > C(p,k)면 IMPOSSIBLE_COMBINATION(`lotto.too_few_combinations`, max=C). C(p,k) ≤ 10,000이면 전체 조합을 열거해 비복원 추출(오탐 0), 그보다 크면 게임 단위 전체 재추첨(거절 시 일부 번호만 바꾸지 않음) ④ 입력 계약: 범위 밖·정수 아님·고정/제외 내부 중복 → INVALID_INPUT, 논리적으로 불가능(고정∩제외, 후보 부족, 조합 부족) → IMPOSSIBLE_COMBINATION ⑤ hint 키는 `lotto.*` 네임스페이스, 해결 안내 수치는 EngineError에 `detail?: Record<string, number>` 추가(lottery-core 소규모 변경, 이 작업 쓰기 허용) ⑥ 균등성: p=8,k=2(28조합)에서 카이제곱 테스트(고정 시드, 유의수준 0.001) ⑦ 시안의 생성 방식 "통계 조건 반영"은 P0에서 제외(예측 표현 금지 PRD#6 — 화면 작업 018·025에서 "무작위 / 조건 지정"만)

## 하지 않을 것
- 통계 기반 가중치(예측 표현 금지, `01#6`)

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./packages/lotto-engine test` 통과: 속성 테스트(임의 유효 조건 → 고정 포함·제외 미포함·6개·중복 없음), 불가능 조건은 제한 시간 안에 오류
- [x] `pnpm --filter ./packages/lotto-engine test -- --coverage` 리포트 생성
