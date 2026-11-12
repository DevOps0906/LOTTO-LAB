# task-012 lottery-core: 난수 주입·엔진 오류 타입·당첨 판정 단일 함수

| 항목 | 내용 |
|---|---|
| 웨이브 | W2 |
| 선행 | task-011 |
| 위험도 | 높음 |
| 보안 영향 | 의존성(속성 기반 테스트 도구 최초 도입, devDependency) |
| 담당 | builder → tester(속성 테스트) → codex-reviewer(code) |
| 근거 | `docs/adr/0002-engine-on-device.md` · `docs/02_ARCHITECTURE.md#2` `#3` DF-5 · `docs/04_API.md#1` A-04·A-05 메모 · R1 |
| 쓰기 허용 | `packages/lottery-core/**`, 루트 `pnpm-lock.yaml` |

## 할 것
- 난수 원천 인터페이스(주입), 엔진 오류 타입 `IMPOSSIBLE_COMBINATION`(해결 방안 문구 키 포함)
- 판정 함수 하나(기기·서버 공용): 로또 등위(번호·보너스), 연금 등위(조·자리 일치). 등위 기준은 `draws_*.prizes`·공식 기준과 대조, 불명확하면 `미확인`으로 테스트 보류 표시
- 순수 함수: 네트워크·저장소·시간·전역 상태 접근 금지

- 팀장 결정(challenger 반영, 2026-11-12): ① task-011 커밋 후 착수(타입·범위 상수는 `@lotto-lab/types`) ② 회차 계산은 범위 밖 — "KST 오늘 날짜"(`YYYY-MM-DD`, 시각은 인자)만. 현재 회차는 데이터(`draws_*` 최신 draw_no·draw_date)에서 구한다(016). 판정은 호출자가 회차 데이터를 명시적으로 넘김(`saved_tickets.round` NULL 처리도 호출자 책임) ③ 연금 보너스는 등위와 독립 판정(동시 당첨 허용) — **공식 규정 미확인 가정**, 해당 테스트에 `ASSUMPTION(연금 보너스 독립)` 주석, 확인 시 갱신 ④ 판정 입력 전제 위반(중복 번호·보너스가 nums에 포함·digits 6자리 아님·조 범위 밖)은 `EngineError{code:'INVALID_INPUT'}` 던짐(게스트 로컬 데이터는 DB CHECK를 거치지 않음). 벡터: `123456` 대 `123450` → null, `000719` 앞자리 0, 로또 6개 일치는 1등(2등 아님) ⑤ Rng: `nextInt(maxExclusive)` 거절 샘플링(모듈로 편향 없음). 결정적 시드 구현 알고리즘 고정 — 시드 파생 FNV-1a 32비트(동기) → xoshiro128**, 골든 벡터 테스트(바뀌면 실패). 기본 crypto Rng는 `createCryptoRng(fill)`로 바이트 채움 함수를 인자로 받음(전역 접근 없음 — 셸·app-core가 주입) ⑥ 테스트 전용 subpath 만들지 않음(arbitraries는 각 패키지 테스트 안) ⑦ Deno 재사용 검사(`deno check`)는 A-09 작업으로 연기, 상대 import는 `.ts` 확장자 ⑧ vitest(+coverage, 기준 라인 90%) 스크립트, fast-check는 validation과 같은 버전

## 하지 않을 것
- 번호 생성 로직(task-013·014), 서버 A-09(P1)

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./packages/lottery-core test` 통과(등위별 예제 + 속성 테스트: 같은 시드 → 같은 결과)
- [x] `pnpm --filter ./packages/lottery-core test -- --coverage` 리포트 생성(기준치는 팀장 결정 필요)
