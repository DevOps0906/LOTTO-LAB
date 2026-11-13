# task-016 app-core: 어댑터·로컬 저장·티켓 상태·공개 데이터 읽기

| 항목 | 내용 |
|---|---|
| 웨이브 | W2 |
| 선행 | task-011, task-013, task-014, task-007 |
| 위험도 | 높음 |
| 보안 영향 | 의존성(Supabase JS) · 키·권한(anon 키만 번들) |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | `docs/02_ARCHITECTURE.md#2` `#3` DF-1·DF-4·DF-5·DF-6 · `docs/04_API.md#1` A-01~A-03·A-06 · `#4` · R22 |
| 쓰기 허용 | `packages/app-core/**`, `packages/validation/src/local.ts`·index·해당 테스트, 루트 `pnpm-lock.yaml` |

## 할 것
- 플랫폼 어댑터 인터페이스(클립보드·공유·로컬 저장), 19세 확인 기록(로컬)
- 게스트 로컬 저장: 생성 이력·즐겨찾기·구매(멱등 키 발급, 역전환 금지), 추천은 구매로 간주 안 함
- anon 공개 읽기(회차·통계) + 기기 캐시·오프라인 마지막 동기화 표시, 판정은 `lottery-core` 호출
- R22: 캐시 TTL은 측정 후 확정해 `docs/04_API.md#4`에 기록

- 팀장 결정(challenger 반영, 2026-11-12): ① 저장 구조: 레코드마다 키 1개(`ll:v1:<종류>:<id>`, 목록은 접두사 keys로 구성) — 목록 통째 덮어쓰기 없음. 쓰기는 app-core 단일 비동기 큐로 직렬화, 어댑터 계약에 `flush()`(tauri-store 즉시 저장) 포함. 다중 창·탭 동시성은 범위 밖(셸 단일 창) ② 로컬 id·멱등 키는 생성 시점 uuid로 고정, 구매 전환은 id 기준 멱등 ③ 격리: 검증 실패·미래 버전 레코드는 읽기에서 건너뛰고 **절대 다시 쓰거나 지우지 않음**(목록 재저장이 없으므로 보존됨). 마이그레이션은 레코드 단위 지연 변환(레코드에 `v` 필드), 원본 키를 덮어쓰는 시점은 변환 검증 성공 후 ④ 로컬 레코드 스키마는 validation에 별도 정의(`LocalTicketSchema` round NULL 허용·id·created_at 포함, `LocalGeneratedSchema`, `LocalSettingsSchema` — 쓰기 허용에 `packages/validation/src/local.ts`·테스트 추가) ⑤ 범위: A-01·A-02·A-03·A-06 공개 읽기, DF-6 19세 확인 로컬 기록 포함. A-07(로그인 동기화)은 P1 제외 ⑥ 공개 읽기는 fetch로 PostgREST 직접(supabase-js 없음 — 새 의존성·localStorage 세션 회피), URL·publishable 키는 셸이 `AppConfig`로 주입 ⑦ 캐시: 마지막 정상본 + `fetched_at`·`source_url`·`source_verified_at` 함께 보관·화면 전달, 초기 TTL 회차 10분·통계 60분(상수, R22 수치 확정은 출시 점검 task-036에서 측정 후 04#4 기록), 수동 새로고침 제공 ⑧ 구매 회차: 기본값 = 캐시 최신 draw_no + 1, 캐시가 8일 넘게 오래되면 사용자가 회차를 직접 확인·입력(회차 없이 저장 허용 — round NULL) ⑨ 판정 결과는 로컬에 저장하지 않고 표시 시점에 캐시 회차로 계산(회차 정정 자동 반영), 대상은 purchased만(DF-5) ⑩ 생성 이력 최근 200개 유지하되 저장 번호가 참조하는 항목은 지우지 않음, 저장 번호 상한 1,000 ⑪ 테스트: vitest(같은 버전) + 비동기 지연·중간 실패를 주입하는 목 어댑터로 겹침·부분 실패 경로 재현

## 하지 않을 것
- 로그인·동기화(P1), 서버 생성 호출(D4)

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./packages/app-core test` 통과: 추천→구매 미승격, purchased→favorite 거부, 오프라인 시 캐시 반환
- [x] `pnpm lint` 통과(`@capacitor/*`·`@tauri-apps/*` import 없음)
