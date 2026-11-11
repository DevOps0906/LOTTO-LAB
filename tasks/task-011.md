# task-011 types + validation (Zod 스키마·DTO)

| 항목 | 내용 |
|---|---|
| 웨이브 | W2 |
| 선행 | task-005 |
| 위험도 | 높음 |
| 보안 영향 | 의존성(Zod 최초 도입) |
| 담당 | builder → codex-reviewer(code) |
| 근거 | `docs/04_API.md#1` `#2` · `docs/05_DATA_MODEL.md#2` `#4` · `docs/01_PRD.md#9` 2·4 |
| 쓰기 허용 | `packages/types/**`, `packages/validation/**` |

## 할 것
- DTO: 회차(로또·연금, `prizes`·`source_url`·`source_verified_at`), 통계 캐시, `saved_tickets`(A-07·A-14 입력), 오류 응답 `{error:{code,message}}`
- Zod: 로또 6개 1~45 중복 없음, 연금 조 1~5·`digits` 문자열 `^[0-9]{6}$`(숫자 변환 금지), `amount_won ≥ 0`, 상태 전환 규칙
- 오류 코드 열거형은 `04#2`와 1:1

## 하지 않을 것
- 엔진 로직, 서버 코드

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/validation test` 통과: `"000719"` 왕복 보존, `719`(number) 거부, 중복 번호 거부
- [ ] `pnpm typecheck` 통과
