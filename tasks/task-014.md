# task-014 pension-engine: 조·자리 생성, 5조 세트

| 항목 | 내용 |
|---|---|
| 웨이브 | W2 |
| 선행 | task-012 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → tester(속성 테스트) |
| 근거 | `docs/01_PRD.md#9` 4·5 · `docs/05_DATA_MODEL.md#4` · `spec M-03` form 블록 |
| 쓰기 허용 | `packages/pension-engine/**` |

## 할 것
- 조 1~5/자동, 여섯 자리 각 0~9/자동, 낱장·선택 조·5조 세트, 기본번호 수, 끝자리 조건
- 출력 `digits`는 항상 6자리 문자열. 5조 세트 = 같은 여섯 자리의 1~5조 5장
- 고정 여섯 자리 + 다중 베이스 등 충돌은 `IMPOSSIBLE_COMBINATION`

## 하지 않을 것
- 숫자형 변환·저장 로직

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/pension-engine test` 통과: 속성 테스트(모든 출력 `^[0-9]{6}$`, 세트는 조 1~5·digits 동일), `000719` 고정 입력 보존
- [ ] `pnpm --filter ./packages/pension-engine test -- --coverage` 리포트 생성
