# task-037 fortune-engine: 테마·사주 번호 결정적 생성

| 항목 | 내용 |
|---|---|
| 웨이브 | W7(P1) |
| 선행 | task-013, task-014 |
| 위험도 | 높음(새 의존성: 음양력 변환) |
| 보안 영향 | 새 의존성(라이선스·공급망) |
| 담당 | builder → tester(속성 테스트) |
| 근거 | `docs/adr/0005-fortune-numbers.md` · `docs/adr/0002-engine-on-device.md` · `docs/01_PRD.md#6`·`#7` Q7 |
| 쓰기 허용 | `packages/fortune-engine/**`, `eslint.config.mjs`(ALLOWED에 fortune-engine 층 추가), `packages/app-core/package.json`(의존 추가), 루트 `pnpm-lock.yaml` |

## 할 것
- 테마(별자리 12궁·띠 12지·생년월일·기념일·꿈 키워드 사전)와 사주(양/음력·시각 선택 → 천간지지·오행) 입력 → 결정적 시드(입력+날짜) → `lotto-engine`에 난수 원천 주입, 고정 번호 조합, 출처 `method` 반환
- 순수 함수(네트워크·저장소·시각 접근 없음, 날짜는 인자로 받음)
- 출력은 로또(6개)와 연금(조 1~5 + 6자리 문자열, `pension-engine`) 모두. 하루 1세트: 같은 입력·같은 날짜 → 같은 결과(사용자 결정, ADR-0005)

- 계획 승인(2026-11-13 사용자, 기본값): 기념일은 날짜만 · 행운 숫자 1~5개(로또 전용, 연금 요청은 INVALID_INPUT) · 사주 시각은 12시진 ID(`ja`…`hae`) 또는 null · 꿈 사전 약 30개(자체 작성, id 영문 소문자) · 로또 5게임 고정, 연금은 기본 번호 1개×선택 조 · 기기 비밀값 `^[0-9a-f]{64}$` 필수 · 결과 `{ method, games|tickets, engine_version: "fortune@1+lotto@1" }`
- 공개 API: `generateFortune(req: FortuneRequest, ctx: { date; deviceSecret })`, 테마 7종 합 타입(zodiac_sign·zodiac_animal·birthday·anniversary·lucky·dream·saju)
- 팀장 결정: ADR-0005 '착수 결정' ①~⑧ 그대로. 완료 조건에 결정성·골든 벡터(하위 엔진 버전 포함)·시드 비노출·정규화(전각·공백)·꿈 사전 금지 문구 검사·자체 작성 근거 주석 추가. 만세력은 task-046

## 하지 않을 것
- AI 해몽(P2) · 서버 호출 · 입력값 저장 · '당첨'·'운이 오르는' 류 문구(`01#6`)

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./packages/fortune-engine test` 통과: 속성 테스트(같은 입력+날짜 → 같은 결과, 6개, 1~45, 중복 없음, 고정 번호 포함), 행운 숫자 6개·연금 행운 숫자는 `INVALID_INPUT`(계획 승인으로 불가능 조합 경로 없음)
- [x] 새 외부 의존성 없음(음양력 변환은 task-046) — lockfile은 워크스페이스 링크만 커밋
