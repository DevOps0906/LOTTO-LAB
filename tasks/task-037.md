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

- 팀장 결정: ADR-0005 '착수 결정' ①~⑧ 그대로. 완료 조건에 결정성·골든 벡터(하위 엔진 버전 포함)·시드 비노출·정규화(전각·공백)·꿈 사전 금지 문구 검사·자체 작성 근거 주석 추가. 만세력은 task-046

## 하지 않을 것
- AI 해몽(P2) · 서버 호출 · 입력값 저장 · '당첨'·'운이 오르는' 류 문구(`01#6`)

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/fortune-engine test` 통과: 속성 테스트(같은 입력+날짜 → 같은 결과, 6개, 1~45, 중복 없음, 고정 번호 포함), 불가능 고정 조건은 제한 시간 안에 `IMPOSSIBLE_COMBINATION`
- [ ] `~/.claude/nomad/bin/secscan license` 통과(음양력 변환 의존성 GPL·AGPL 없음), lockfile 커밋
