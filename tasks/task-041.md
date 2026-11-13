# task-041 모바일 M-18 사주 프로필 · M-19 사주 번호

| 항목 | 내용 |
|---|---|
| 웨이브 | W7(P1) |
| 선행 | task-037, task-038, task-040, 로그인 작업(미등록 — `01#7` Q7) |
| 위험도 | 높음 |
| 보안 영향 | 인증 게이트 · 개인정보 저장(A-17) |
| 담당 | builder → reviewer(security) |
| 근거 | `spec M-18` · `spec M-19` · `docs/03_SCREENS_UX.md` 상태 행 · `docs/04_API.md` A-17 · `docs/adr/0005-fortune-numbers.md` |
| 쓰기 허용 | `apps/mobile/**`, `packages/ui/src/screens/{M-17,M-18,M-19}/**`·`packages/ui/src/index.ts`·`packages/ui/test/{M-17,M-18,M-19}.test.tsx`, `packages/app-core/src/{adapters.ts,index.ts,fortune-profile-service.ts}`·`packages/app-core/test/fortune-profile.test.ts` (2026-11-13 팀장: 화면은 ui, 포트·서비스는 app-core) |

- 팀장 결정(2026-11-13, challenger 반영): ① app-core 포트 `FortuneProfileClient`(get·upsert·delete), 모바일은 auth.ts와 **같은 supabase 클라이언트 하나**로 구현(createAuthClient에서 클라이언트를 꺼내는 리팩터 허용). user_id는 호출 시점 supabase 세션 uid를 셸이 넣는다 ② upsert 페이로드는 5개 열을 항상 명시(`birth_hour` 모름=null, 양력 `is_leap_month`=false) — 이전 값 잔존 방지, "시각 있음→모름" 테스트 ③ 오류는 코드만 매핑(status 0→OFFLINE, 401·PGRST301/303→SESSION_EXPIRED, 42501→FORBIDDEN, 23514·22xxx→INVALID_INPUT), PostgREST detail·message·hint는 버리고 **AppCoreError에 cause를 넣지 않는다**(직렬화 테스트로 생년월일 부재 확인) ④ 게이트는 AuthService 상태 `signedIn`만 허용(loading=대기, consentRequired·signedOut=M-06 유도 returnTo, unavailable=안내). `/fortune/profile`·`/fortune/saju`는 SUB_ROUTES·AUTH_RETURN_PATHS에 포함 ⑤ 계정 전환·로그아웃: 화면을 `key=user.id`로 재마운트, 응답 시점 user.id가 요청 때와 다르면 버림, signedOut이면 폼·결과 즉시 비움 ⑥ 클라이언트 검증은 필수·형식(`YYYY-MM-DD`, 시진 ID, lunar일 때만 윤달)만, 나머지는 DB CHECK(23514) 매핑 ⑦ 프로필 로컬 캐시 없음(온라인 필요, ADR-0005 기록) ⑧ 고정 번호 옵션 없음(ADR-0005 ③, 03 M-19 행 정정), 로또·연금 탭(M-17과 같은 결과 컴포넌트) ⑨ 천간지지·오행 카드는 task-046 ⑩ 12시진 유지 ⑪ spec.json은 design/ 미커밋 결정 중이라 재생성하지 않음 — 03_SCREENS_UX가 정본

- 알려진 한계(2026-11-13 보안 리뷰): 재저장 시 `consented_at`은 갱신되지 않음(UPDATE 열 권한 제외). 기존 프로필이면 동의 체크를 미리 켬 — 수집 항목·목적 문구를 바꾸면 동의 문구 버전 + consented_at 갱신 경로(트리거·RPC)를 추가해 재동의를 받는다. 개인정보 처리방침 링크 미연결 시 출시 차단 항목(열린 결정 ② 문의처와 함께)

## 할 것
- 프로필 저장 오류(23514 CHECK 위반 등)의 서버 detail("Failing row contains …")에는 생년월일 원문이 있다 — 화면·로그·분석에 detail을 남기지 않고 코드로만 매핑(task-040 확인)
- M-17 "사주 번호(회원)" 링크 연결(task-038에서 M-19 미구현으로 보류 — `apps/mobile/src/routes/screens.tsx` THEME_LINKS에 saju 추가)
- 로그인 세션 없으면 M-18·M-19 진입 차단 + 가입 유도(M-06)
- M-18: 동의 후 A-17 저장·삭제, M-19: 프로필 → `fortune-engine` 기기 계산 → 결과 저장(generated, `method=saju`), 고지 고정 표기

## 하지 않을 것
- 성별 등 추가 수집 · 생년월일·시각을 로그·분석 이벤트에 기록 · 구매·당첨 상태 변경

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter mobile test`·ui·app-core 테스트 통과: 비로그인 진입 차단, 동의 없이 저장 불가, 같은 날 같은 결과(saju·generated), upsert 5열 명시, 오류 직렬화에 생년월일 없음, 계정 전환 시 이전 응답 폐기
- [x] 프로필 삭제 후 A-17 GET 0행 확인
