# task-013 lotto-engine: 자동/반자동 생성

| 항목 | 내용 |
|---|---|
| 웨이브 | W2 |
| 선행 | task-012 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → tester(속성 테스트) |
| 근거 | `docs/01_PRD.md#9` 1·2·3 · `docs/adr/0002-engine-on-device.md` · `spec M-02` form 블록(조건 범위) |
| 쓰기 허용 | `packages/lotto-engine/**` |

## 할 것
- 고정 0~6·제외 0~39·게임 수 1~50, 고정/제외 겹침·남은 수 부족은 즉시 `IMPOSSIBLE_COMBINATION`(무한 대기 금지, 시도 상한)
- 결과 각 게임 6개 정수 1~45 중복 없음·오름차순, `engine_version` 반환
- 고급 조건(구간·홀짝·합계·연속)은 P1 — 인터페이스 자리만

## 하지 않을 것
- 통계 기반 가중치(예측 표현 금지, `01#6`)

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/lotto-engine test` 통과: 속성 테스트(임의 유효 조건 → 고정 포함·제외 미포함·6개·중복 없음), 불가능 조건은 제한 시간 안에 오류
- [ ] `pnpm --filter ./packages/lotto-engine test -- --coverage` 리포트 생성
