# 04 API — LOTTO LAB

> 근거: `LOTTO_LAB_PRD.md#9`(원본 계약 10개) · `PLAN_BRIEF.md` D4·D5·D7·D9 · [`REVIEW_doc.md`](REVIEW_doc.md) R2·R3·R5~R9·R13·R18~R21. 테이블 정의는 [`05_DATA_MODEL.md#2`](05_DATA_MODEL.md), 보안 레벨·키 목록은 [`01_PRD.md#8`](01_PRD.md).
> 구현 구분(D5): **EF** = Supabase Edge Function(`/v1/*` 경로 유지) · **RLS** = 클라이언트가 supabase-js로 테이블 직접 접근(경로는 논리 이름). 공개 읽기(`draws_*`·`statistics_cache`)는 anon SELECT RLS 직접, EF는 판정·관리자·waitlist만(R6). 수집 워커(Python)는 API가 아니라 service_role로 DB에 직접 쓴다 → [`02_ARCHITECTURE.md#3`](02_ARCHITECTURE.md).

## 1. 엔드포인트

| ID | 메서드 | 경로 | 입력 | 출력 | 권한 | 오류 | 사용 테이블 | 구현 |
|---|---|---|---|---|---|---|---|---|
| A-01 | GET | `/v1/draws/lotto/latest` | — | `draw_no, draw_date, nums[6], bonus, prizes, source_url, source_verified_at` | 공개(anon SELECT) | 0행 → 미갱신 표시 | `draws_lotto` | RLS |
| A-02 | GET | `/v1/draws/pension/latest` | — | `draw_no, draw_date, group_no, digits:"string(6)", bonus_digits:"string(6)", prizes, source_url, source_verified_at` | 공개(anon SELECT) | 0행 → 미갱신 표시 | `draws_pension` | RLS |
| A-03 | GET | `/v1/draws/{game}/{round}` | `game`(lotto\|pension), `round`(정수 ≥1, 클라이언트 검증) | A-01 또는 A-02 형식 1건 | 공개(anon SELECT) | 0행 → 없음/미수집 표시 | `draws_lotto` / `draws_pension` | RLS |
| A-04 | — | ~~`/v1/generate/lotto`~~ | — | — | — | — | — | **미구현(D4)** — 생성은 기기 `lottery-core` |
| A-05 | — | ~~`/v1/generate/pension`~~ | — | — | — | — | — | **미구현(D4)** — 생성은 기기 `lottery-core` |
| A-06 | GET | `/v1/statistics/{game}` | `game`, `window`, `metric` (허용 값 목록 팀장 결정 필요) | `payload` + `range_from, range_to, updated_at, source, sample_size` (원본 2.3 필수 표기) | 공개(anon SELECT) | 0행 → 미갱신 표시 | `statistics_cache` | RLS |
| A-07 | POST | `/v1/tickets` | `game, round, ticket_data, purchase_status`(favorite\|purchased), `purchase_date?`, `amount_won?`, `source_number_id?`, `idempotency_key`(필수) | 생성된 `saved_tickets` 행(201) · 중복 `idempotency_key`면 기존 행(200, R18) | 로그인(본인 행만, RLS) | 400, 401, 429 | `saved_tickets` | RLS |
| A-08 | GET | `/v1/tickets` | query `game?`, `round?`, `status?`, 커서 페이지 | `saved_tickets[]` + 최신 `draw_checks`(이력은 같은 테이블 누적, R8) | 로그인(본인 행만, RLS) | 401 | `saved_tickets`, `draw_checks` | RLS |
| A-09 | POST | `/v1/tickets/check` | `ticket_ids[]` 또는 `round` | `[{ticket_id, draw_no, matched_rank, checked_at}]` | 로그인 + 본인 티켓, `purchased`만 판정(원본 10장 5) | 400, 401, 404, 429, 503 | `saved_tickets`, `draws_*`, `draw_checks`(서버만 INSERT) | EF |
| A-10 | GET | `/v1/subscriptions/me` | — | `store, product_id, state` | 로그인(본인 행만 읽기) | 401 | `subscription_accounts` | RLS (P2, 결제 미결 Q3) |
| A-11 | GET | `/v1/admin/ingestions` | query `status?`(needs_review 등), `game?`, 커서 | `ingestion_runs[]`(원본 응답 해시·검증 오류·재검증 결과 포함) | 관리자 + MFA | 401, 403 | `ingestion_runs` | EF |
| A-12 | POST | `/v1/admin/ingestions/{id}/approve` | path `id`, `note?` | 승인된 run + UPSERT된 회차 → 통계 캐시 재계산·알림 재개 | 관리자 + MFA, **A-16 재검증 통과 건만**(R9) | 401, 403, 404, 409(이미 처리·재검증 미통과) | `ingestion_runs`, `draws_*`, `statistics_cache` | EF |
| A-13 | POST | `/v1/admin/ingestions/{id}/reject` | path `id`, `reason`(필수) | 반려된 run(회차 미반영, 알림 중단 유지) | 관리자 + MFA | 400, 401, 403, 404, 409 | `ingestion_runs` | EF |
| A-14 | PATCH | `/v1/tickets/{id}` | path `id`, `purchase_status:"purchased"`, `purchase_date`, `amount_won` | 갱신된 `saved_tickets` 행 | 로그인(본인 행만, RLS). 허용 전환 favorite→purchased(R2), 역전환 금지(R19) | 400, 401, 404, 422 | `saved_tickets` | RLS |
| A-15 | POST | `/v1/waitlist` | `email`, `consent_marketing:true`, `age_confirmed:true`(만 19세 이상), `turnstile_token`(R21) | `202`(본문 없음, 중복 이메일도 동일) | 공개(anon) | 400, 429 | `waitlist_signups`(INSERT만) | EF |
| A-16 | POST | `/v1/admin/ingestions/{id}/reverify` | path `id` | run + 재검증 결과(`reverified_at`, `reverify_errors`) | 관리자 + MFA | 401, 403, 404, 409(이미 처리), 503(출처 접속 실패) | `ingestion_runs` | EF |
| A-17 | GET · PUT · DELETE | `/v1/fortune-profile` | PUT: `birth_date`, `calendar`(solar\|lunar), `is_leap_month?`, `birth_time?`(모르면 NULL), `consented_at`(동의 필수) | 본인 `fortune_profiles` 1행(GET 0행 → 프로필 입력 안내) | 로그인(본인 행만, RLS). 사주 번호 계산은 기기 `fortune-engine`(ADR-0005), 서버 계산 없음 | 400, 401 | `fortune_profiles` | RLS (P1) |
| A-18 | GET · POST | `/v1/waitlist/unsubscribe` | 메일 링크의 `e`(email_norm), `t`(HMAC-SHA256(email_norm, UNSUBSCRIBE_SECRET)) — GET은 확인 화면, POST가 삭제 | 삭제 완료 안내(행이 없어도 같은 응답) | 공개(서명 토큰) | 400(서명 불일치), 429 | `waitlist_signups`(DELETE) | EF |
| A-19 | POST | `/v1/waitlist-confirm`(별도 EF, verify_jwt=false) | `token`(확인 메일 링크 `/waitlist/confirm#token=…` — 쿼리스트링 아님(접근 로그·Referer 유출 방지), 웹 W-05가 버튼 클릭 시 전송 — 스캐너 자동 확인 방지) | `200`(확정, 같은 토큰 재제출로 이미 확정도 200) | 공개(토큰) | 400 `INVALID_INPUT`(없음·만료 구분 없이 동일), 429(IP 키 `confirm:` 접두로 A-15와 분리), 503 | `waitlist_signups`(UPDATE confirmed_at) | EF |

- 연금 번호(`digits`, `bonus_digits`, `ticket_data`)는 요청·응답 모두 **JSON 문자열**. 숫자 변환 금지 → [`05_DATA_MODEL.md#4`](05_DATA_MODEL.md).
- `prizes`(등위별 당첨금·인원)·`source_url` 형식 → [`05_DATA_MODEL.md#2`](05_DATA_MODEL.md).
- A-04·A-05(R5): 서버 생성 없음 확정. 생성 조건 위반(조합 불가)은 HTTP 409가 아니라 `lottery-core` 엔진 오류 타입 `IMPOSSIBLE_COMBINATION`으로 기기에서 처리. 유료 생성 한도는 [`01_PRD.md#7`](01_PRD.md) 미결.
- A-07 `idempotency_key`(R18): UNIQUE(`user_id, idempotency_key`)로 중복 행 방지. 중복이면 새 행 없이 기존 행을 200으로 반환(재시도 안전).
- A-14(R19): purchased→favorite 역전환 금지. RLS UPDATE로는 방향을 막지 못하므로 DB 트리거가 거부 → 클라이언트가 422 `INVALID_TRANSITION`으로 매핑([05#2](05_DATA_MODEL.md)).
- A-15(R21): 중복 이메일도 같은 202(가입 여부 노출 금지). EF가 Cloudflare Turnstile 토큰 검증 후 INSERT. Turnstile 검증 실패 응답 코드 팀장 결정 필요.
- A-16(R20): `source_url`에서 재수집 → 저장된 `raw_payload`와 대조 → 결과 기록([05#5](05_DATA_MODEL.md)). 출처 접속 실패면 503.
- 관리자 판별: Supabase Auth JWT의 `app_metadata.role = "admin"`(service_role로만 부여) **그리고** `aal = "aal2"`(TOTP MFA 통과, R13). EF가 확인 후 service_role로 DB 접근.

## 2. 공통 에러 코드
응답 형식: `{ "error": { "code": "<CODE>", "message": "<사용자 표시용 한국어>" } }` (EF 응답. RLS 직접 호출은 PostgREST 오류를 클라이언트가 같은 코드로 매핑)

| HTTP | code | 의미 | 사용 |
|---|---|---|---|
| 400 | `INVALID_INPUT` | 입력 조건 위반(범위·형식·동의 누락 등) | A-07, A-09, A-13~A-15 |
| 401 | `UNAUTHENTICATED` | 로그인 필요·토큰 만료 | 사용자·관리자 API |
| 403 | `FORBIDDEN` | 관리자 아님 | A-11~A-13, A-16 |
| 403 | `MFA_REQUIRED` | 관리자이나 `aal2` 아님(TOTP 미통과) | A-11~A-13, A-16 |
| 404 | `NOT_FOUND` | 티켓·run 없음(타인 티켓도 404로 응답) | A-09, A-12~A-14, A-16 |
| 409 | `ALREADY_PROCESSED` | 이미 승인·반려된 run | A-12, A-13, A-16 |
| 409 | `NOT_REVERIFIED` | 재검증 미실행 또는 미통과 run 승인 시도 | A-12 |
| 422 | `INVALID_TRANSITION` | 허용되지 않은 구매 상태 전환(purchased→favorite, R19) | A-14 |
| 429 | `RATE_LIMITED` | 레이트 리밋 초과(`Retry-After` 헤더) | 4절 대상 |
| 503 | `DATA_STALE` | 공식 데이터 미갱신·검토 대기(해당 회차 미수집) | A-09 |
| 503 | `SERVICE_UNAVAILABLE` | 의존 서비스 장애(Turnstile 검증·레이트리밋·저장 실패) — fail-closed | A-15 |
| 500 | `INTERNAL` | 서버 설정 누락(필수 환경변수) | EF 공통 |
| 405 | `METHOD_NOT_ALLOWED` | 허용되지 않은 메서드 | EF 공통 |
| 503 | `SOURCE_UNAVAILABLE` | 재검증 중 출처 접속 실패(R20) | A-16 |

## 3. 생성 API(A-04·A-05) — 결정됨(R5)
1절 표 아래 메모로 대체. 이 장은 번호 유지용.

## 4. 캐시 · 레이트 리밋
| 대상 | 캐시 | 레이트 리밋 |
|---|---|---|
| A-01~A-03·A-06 | RLS 직접 읽기 → 클라이언트 캐시, 새 회차 반영 시 무효화. TTL 값 팀장 결정 필요 | Supabase 기본 한도. 추가 한도 팀장 결정 필요 |
| A-07·A-08·A-10·A-14 | 캐시 안 함(사용자 데이터) | Supabase 기본 한도. 쓰기 남용 한도 팀장 결정 필요 |
| A-09 | 캐시 안 함 | 사용자 기준, 수치 팀장 결정 필요 |
| A-11~A-13·A-16 | 캐시 안 함 | 관리자 기준, 수치 팀장 결정 필요 |
| A-15 | 캐시 안 함 | IP 기준 고정 창 10분 5회(env `WAITLIST_RATE_WINDOW_SEC`·`WAITLIST_RATE_MAX`, 측정 후 조정) — DB 카운터, 키 sha256(`RATE_SALT`‖IP, IPv6 /64), IP는 `x-real-ip` → XFF 맨 오른쪽(로컬 Kong 확인, 운영 배포 후 재확인). Turnstile 봇 차단(R3·R21·R22) |

- EF 레이트 리밋 구현 방식(DB 카운터 / 외부 저장소)은 팀장 결정 필요(새 의존성이면 `security-baseline`).

## 5. 위협 메모 (노출 면별, `security-baseline/references/threat-model.md`)
| 항목 | 공개 읽기 A-01~A-03·A-06 | 사전알림 A-15 | 사용자 A-07~A-10·A-14 | 관리자 A-11~A-13·A-16 |
|---|---|---|---|---|
| 노출 면 | 인터넷 누구나(anon 키, RLS 직접) | 공개 웹 W-01 폼(A-15) · 확인 W-05(A-19) | 로그인 사용자 앱(모바일·Windows) | 관리자 웹(W-xx, P1) |
| 인증·인가 | 없음, SELECT 전용 RLS | 없음 — 테이블 직접 접근 차단(REVOKE), EF(service_role)만 쓰기 | JWT + RLS `auth.uid() = user_id` | JWT + `role=admin` + `aal2`(TOTP MFA 필수, R13) |
| 다루는 데이터 | 공개 추첨 결과·당첨금·통계 | 이메일(개인정보)·동의·연령 확인·확인 토큰(sha256만 저장, 원문은 메일 링크 `#token=`에만) | 사용자 번호·구매 여부·구매일·금액·구독 상태 | 수집 원본 응답·검증·재검증 오류 |
| 필요한 키 | anon(앱 번들 허용) | 키 없이 EF 호출(verify_jwt=false) — EF 내부 service_role·Turnstile secret·RATE_SALT·MAIL_API_KEY(외부 메일 서비스, 사용자 결정 대기)(환경변수만) | anon + 사용자 JWT | EF 내부 service_role(앱 번들 금지, D9) |
| 입력 | 클라이언트 필터 값 검증, 쓰기 RLS 없음 | 이메일 형식·길이, 동의·연령 `true` 필수(DB CHECK 이중) | `ticket_data` 스키마 검증(연금 `^[0-9]{6}$`, 로또 1~45 6개), `amount_won ≥ 0` — DB CHECK 이중 방어 | `id` UUID, `reason` 길이 제한 |
| 체인 | 오염된 수집값 → 잘못된 판정·알림 | 스팸 대량 등록 → 발송 평판·저장 비용. 이중 확인(사용자 결정 2026-11-12)으로 미확인 행은 출시 알림 대상 아님·만료 후 1시간 내 삭제. 제3자 메일 폭탄: 미만료 확인 링크가 있으면 새 메일 없음(토큰 덮어쓰기 금지) + IP 10분 5회 + Turnstile. 남은 위험: 공격자가 먼저 신청하면 피해자는 링크 만료(24h)까지 새 메일을 못 받음 | RLS 누락 → 타인 번호·구매 정보 노출 | 관리자 탈취 → 오염 회차 승인 → 전체 판정·알림 오염 |
| 피해 범위 | 데이터 신뢰도 | 대기자 명단 품질·발송 도메인 | 본인 행(RLS 정상 시) | 전 사용자 판정·알림 |
| 남용 | 스크래핑 → Supabase 기본 한도 | 봇 등록 → Turnstile + 4절 IP 리밋(R21), 가입 여부 탐색 → 중복도 같은 202 | 대량 저장·판정 반복 → 4절 리밋, 중복 저장 → `idempotency_key` | — |
| 로그 | 요청 수·오류 | 요청 수·거부 사유 O, 이메일 원문 X | 판정 요청 O, `ticket_data` 본문 X | 재검증·승인·반려 감사 로그(누가·언제·run id) O |
| 결정 | 검증 통과분만 노출([05#5](05_DATA_MODEL.md)) | 보관 6개월 후 삭제([05#2](05_DATA_MODEL.md)), 열람은 service_role만 | 판정·`draw_checks` 쓰기는 서버만 | 재검증 통과 건만 승인, 감사 기록·MFA 필수 |

운세·테마 번호([ADR-0005](adr/0005-fortune-numbers.md)) — 노출 면이 다른 두 기능을 따로 적는다.

| 항목 | 사주 프로필 A-17 (P1) | 테마 번호 (기기 전용, 서버 호출 없음) |
|---|---|---|
| 노출 면 | 로그인 사용자 앱(M-18·D-16), RLS 직접 | 없음(오프라인 기기 실행) — 앱 화면 M-17·D-15만 |
| 인증·인가 | JWT + RLS `auth.uid() = user_id`, 로그인 세션 없으면 화면 진입 차단 | 없음(게스트 가능) |
| 다루는 데이터 | 생년월일·양/음력·태어난 시각(선택) — 개인정보, 성별 미수집 | 별자리·띠·생년월일·기념일·꿈 키워드(기기 메모리만, 저장 안 함) |
| 필요한 키 | anon + 사용자 JWT | 없음 |
| 입력 | 날짜 범위·`calendar` 값·시각 형식 Zod 검증 + DB CHECK 이중 | 기기 Zod 검증, 꿈은 사전 키워드 선택만(자유 텍스트 미전송) |
| 체인 | RLS 누락 → 타인 생년월일 노출 | 분석 이벤트·크래시 로그에 입력값 혼입 → 의도치 않은 수집 |
| 피해 범위 | 본인 행(RLS 정상 시) | 기기 사용자 1명 |
| 남용 | 반복 저장 → Supabase 기본 한도(4절) | — |
| 로그 | 요청 수·오류 O, 생년월일·시각 원문 X | 생성 이벤트에 `method`만 O, 입력값 X |
| 결정 | 동의 후 저장·계정 삭제 시 CASCADE 파기·프로필 삭제 버튼 제공 | 입력값 서버 전송·로컬 저장 금지 |
