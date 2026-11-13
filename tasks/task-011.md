# task-011 types + validation (Zod 스키마·DTO)

| 항목 | 내용 |
|---|---|
| 웨이브 | W2 |
| 선행 | task-005 |
| 위험도 | 높음 |
| 보안 영향 | 의존성(Zod 최초 도입) |
| 담당 | builder → codex-reviewer(code) |
| 근거 | `docs/04_API.md#1` `#2` · `docs/05_DATA_MODEL.md#2` `#4` · `docs/01_PRD.md#9` 2·4 |
| 쓰기 허용 | `packages/types/**`, `packages/validation/**`, `scripts/gen-parity-sql.mjs`, `supabase/tests/validation_parity_test.sql`, 루트 `pnpm-lock.yaml` |

## 할 것
- DTO: 회차(로또·연금, `prizes`·`source_url`·`source_verified_at`), 통계 캐시, `saved_tickets`(A-07·A-14 입력), 오류 응답 `{error:{code,message}}`
- Zod: 로또 6개 1~45 중복 없음, 연금 조 1~5·`digits` 문자열 `^[0-9]{6}$`(숫자 변환 금지), `amount_won ≥ 0`, 상태 전환 규칙
- 오류 코드 열거형은 `04#2`와 1:1

- 팀장 결정(challenger 반영): ① 타입 정본은 `packages/types`(브랜드 없음, 의존 없음) — Zod 스키마는 `z.input`·`z.output`과 types의 **양방향** 동치를 컴파일 단언. 범위 상수(로또 1~45·6개·고정 0~6·제외 0~39·게임 1~50·연금 조 1~5)도 types에 두고 엔진·검증이 함께 import ② 범위: 생성 조건 입력 스키마(범위만, 불가능 조합 판정은 엔진 `IMPOSSIBLE_COMBINATION`), 번호(`NumbersData` — 로또 `{nums}`·연금 `{digits}`)와 티켓(`TicketData` — 로또 `{nums}`·연금 `{group_no,digits}`) 별도 타입, A-07(purchase_status 판별 유니온: favorite은 날짜·금액 없음, purchased는 날짜 필수·금액 선택)·A-14, 회차 읽기(prizes 요소별 관대한 파싱), 오류 응답. A-15·A-17 스키마는 만들지 않음(소비처 없음) ③ 날짜는 `YYYY-MM-DD` 문자열(강제 변환 금지, 존재하는 날짜 검사), 시각은 오프셋 포함 ISO 문자열. KST 오늘 계산은 task-012 ④ Deno 재사용(DF-5) 대비: types·validation의 상대 import는 `.ts` 확장자 명시 ⑤ DB 동치 증명: 공용 판정 벡터 JSON(`packages/validation/test/vectors/*.json`)을 vitest와 pgTAP 둘 다 실행 — `scripts/gen-parity-sql.mjs`가 `supabase/tests/validation_parity_test.sql`을 생성
## 하지 않을 것
- 엔진 로직, 서버 코드

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./packages/validation test` 통과: `"000719"` 왕복 보존, `719`(number) 거부, 중복 번호 거부
- [x] `pnpm typecheck` 통과
