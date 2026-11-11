# task-012 lottery-core: 난수 주입·엔진 오류 타입·당첨 판정 단일 함수

| 항목 | 내용 |
|---|---|
| 웨이브 | W2 |
| 선행 | task-011 |
| 위험도 | 높음 |
| 보안 영향 | 의존성(속성 기반 테스트 도구 최초 도입, devDependency) |
| 담당 | builder → tester(속성 테스트) → codex-reviewer(code) |
| 근거 | `docs/adr/0002-engine-on-device.md` · `docs/02_ARCHITECTURE.md#2` `#3` DF-5 · `docs/04_API.md#1` A-04·A-05 메모 · R1 |
| 쓰기 허용 | `packages/lottery-core/**` |

## 할 것
- 난수 원천 인터페이스(주입), 엔진 오류 타입 `IMPOSSIBLE_COMBINATION`(해결 방안 문구 키 포함)
- 판정 함수 하나(기기·서버 공용): 로또 등위(번호·보너스), 연금 등위(조·자리 일치). 등위 기준은 `draws_*.prizes`·공식 기준과 대조, 불명확하면 `미확인`으로 테스트 보류 표시
- 순수 함수: 네트워크·저장소·시간·전역 상태 접근 금지

## 하지 않을 것
- 번호 생성 로직(task-013·014), 서버 A-09(P1)

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/lottery-core test` 통과(등위별 예제 + 속성 테스트: 같은 시드 → 같은 결과)
- [ ] `pnpm --filter ./packages/lottery-core test -- --coverage` 리포트 생성(기준치는 팀장 결정 필요)
