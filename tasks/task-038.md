# task-038 모바일 M-17 테마 번호

| 항목 | 내용 |
|---|---|
| 웨이브 | W7(P1) |
| 선행 | task-018, task-037 |
| 위험도 | 보통 |
| 보안 영향 | 없음(입력값 기기 처리·미전송·미저장) |
| 담당 | builder |
| 근거 | `spec M-17` · `docs/03_SCREENS_UX.md` M-17 상태 행 · `docs/adr/0005-fortune-numbers.md` |
| 쓰기 허용 | `apps/mobile/**`, `packages/ui/src/screens/M-17/**`·`packages/ui/src/screens/M-15/**`·`packages/ui/src/index.ts`·`packages/ui/test/M-17.test.tsx`, `packages/app-core/src/fortune-service.ts`·`index.ts`·해당 테스트(2026-11-13 팀장: 화면은 ui, 저장·기기 비밀값은 app-core에 있어 확장) |

- 팀장 결정(2026-11-13): 기기 비밀값은 app-core `FortuneService`가 처음 쓸 때 RandomBytes 32바이트로 만들어 LocalStore 설정 키에 저장(내보내기·백업·로그 제외). 생성 결과는 기존 `generated` 레코드(method = 엔진 결과 method)로 저장 — 기존 GenerateService 저장 경로를 재사용하고 입력값은 저장하지 않는다. 날짜는 `kstToday(clock.now())`.

## 할 것
- 테마 탭·입력 → `fortune-engine` 기기 호출 → 결과 표·선택 저장(generated 상태, `method` 기록)
- 고지 "재미·참고용, 전통 상징 해석이며 당첨 확률과 무관" 고정 표기, 행운 숫자는 M-02 고정 번호로 연결, M-15 진입 버튼

## 하지 않을 것
- 입력값 로컬 저장·서버 전송·분석 이벤트 포함 · 구매·당첨 상태 변경

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter mobile test` 통과(같은 날 같은 입력 → 같은 번호, 저장 시 generated·`method` 확인)
- [ ] 생성 후 로컬 저장소·네트워크 요청에 테마 입력값이 없음을 테스트로 확인
- [ ] 기기 비밀값은 RandomBytes(CSPRNG) 32바이트 → 64자 소문자 hex, 한 번 만들면 재사용, 내보내기(local-data export)·백업·로그에 없음을 테스트로 확인
