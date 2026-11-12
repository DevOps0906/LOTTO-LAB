# 05 데이터 모델 — LOTTO LAB

> ERD: [`diagrams/erd.mmd`](diagrams/erd.mmd) — `sql2erd supabase/migrations -o docs/diagrams/erd.mmd` 로 생성 예정(손으로 그리지 않음).
> 근거: `LOTTO_LAB_PRD.md#2`·`#8`·`#10` · `PLAN_BRIEF.md` D4~D7·D9 · [`REVIEW_doc.md`](REVIEW_doc.md) R2·R3·R6~R9. API 매핑은 [`04_API.md#1`](04_API.md).

## 1. 공통 규칙
- DB: Supabase Postgres. 모든 테이블 RLS 활성(정책 없는 테이블 = 클라이언트 접근 차단).
- `game`: enum `game_type` = `lotto` | `pension`.
- 사용자 테이블은 `user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE`(계정 삭제 시 함께 삭제, 원본 11장). 보관 기간 정책 팀장 결정 필요.
- 공통 시각 컬럼: `created_at timestamptz NOT NULL DEFAULT now()`(표에서 생략).
- 게스트 데이터는 기기 로컬에만 저장(D6), 로그인 후 동기화(P1) 시 아래 사용자 테이블로 올린다.
- 권한(task-007 결정): 새 테이블은 `REVOKE ALL ON … FROM anon, authenticated, public` 후 필요한 것만 GRANT(공개 테이블은 `GRANT SELECT`만 — TRUNCATE·REFERENCES·TRIGGER 기본 권한 제거).
- 배열 번호 CHECK: `array_ndims(nums)=1 AND array_lower(nums,1)=1 AND cardinality(nums)=6 AND array_position(nums, NULL) IS NULL` + 범위·오름차순 비교 사슬(NULL·하한 우회 차단).
- `prizes jsonb`: DB는 `jsonb_typeof(prizes)='array'`만 강제, 요소 `{rank, amount_won(정수 원), winners, payout:'lump'|'annuity', months?}`는 Zod·워커가 검증(연금 1·2등은 `annuity` + 월 지급액·`months`).
- FK 삭제: `ingestion_runs.reviewed_by` → `ON DELETE SET NULL`(감사 행 보존), `draws_*.ingestion_run_id` → `ON DELETE RESTRICT`(수집 이력은 회차 정정의 정본, 삭제 금지).
- 남용 상한(task-008): 글자 열 길이·jsonb 4096바이트·배치당 50줄은 DB CHECK. 사용자별 총 행 수 상한은 DB에 두지 않고 API 레이트리밋·앱 정책으로 정한다(수치 팀장 결정 — 04#4).
- 시드(`supabase/seed.sql`)는 합성 데이터만, `source_url='https://synthetic.invalid/…'` 표식. pgTAP은 시드에 기대지 않고 트랜잭션 안에서 자체 데이터를 넣는다. 원격에 `db reset --linked` 금지.

## 2. 테이블
| 테이블 | 컬럼 · 타입 · 제약 | 인덱스 |
|---|---|---|
| `draws_lotto` | `draw_no int PK CHECK(>0)` · `draw_date date NOT NULL UNIQUE` · `nums smallint[] NOT NULL` CHECK(길이 6, 각 1~45, 중복 없음, 오름차순) · `bonus smallint NOT NULL` CHECK(1~45, `nums`에 없음) · `prizes jsonb NOT NULL`(등위별 `[{rank, amount_won, winners}]`, R7) · `source_url text NOT NULL` · `ingestion_run_id uuid NOT NULL FK→ingestion_runs` · `source_verified_at timestamptz NOT NULL` | PK, `draw_date` |
| `draws_pension` | `draw_no int PK CHECK(>0)` · `draw_date date NOT NULL UNIQUE` · `group_no smallint NOT NULL CHECK(1~5)` · `digits char(6) NOT NULL CHECK(digits ~ '^[0-9]{6}$')` · `bonus_digits char(6) NOT NULL CHECK(~ '^[0-9]{6}$')` · `prizes jsonb NOT NULL`(등위별 당첨금·인원, 로또와 같은 형식) · `source_url text NOT NULL` · `ingestion_run_id uuid NOT NULL FK` · `source_verified_at timestamptz NOT NULL` | PK, `draw_date` |
| `ingestion_runs` | `id uuid PK` · `game game_type NOT NULL` · `draw_no int NOT NULL` · `source_url text NOT NULL` · `fetched_at timestamptz NOT NULL` · `payload_sha256 text NOT NULL` · `raw_payload jsonb NOT NULL` · `status text NOT NULL CHECK(in 'verified','needs_review','approved','rejected')` · `validation_errors jsonb` · `reverified_at timestamptz` · `reverify_errors jsonb`(NULL = 통과, R9) · `reviewed_by uuid FK→auth.users` · `reviewed_at timestamptz` · `review_note text` · UNIQUE(`game, draw_no, payload_sha256`) | (`status`, `fetched_at desc`), (`game`, `draw_no`) |
| `generator_profiles` | `id uuid PK` · `user_id` · `game game_type NOT NULL` · `name text NOT NULL` · `config jsonb NOT NULL`(조건 프리셋, 원본 4.3·4.4) · `updated_at timestamptz` | `user_id` |
| `generated_batches` | `id uuid PK` · `user_id` · `game game_type NOT NULL` · `round int`(대상 회차) · `strategy text NOT NULL`(원본 5장 전략 키) · `method text NOT NULL DEFAULT 'random' CHECK(in 'random','condition','zodiac','birthday','dream','saju')`(생성 출처, ADR-0005) · `engine_version text NOT NULL` | (`user_id`, `created_at desc`) |
| `generated_numbers` | `id uuid PK` · `batch_id uuid NOT NULL` · `game game_type NOT NULL`(복합 FK `(batch_id, game)`→generated_batches(id, game) ON DELETE CASCADE — 배치와 같은 게임만) · `line_no smallint NOT NULL` · `numbers jsonb NOT NULL`(로또 `{"nums":[정수 6개]}` / 연금 `{"digits":"000719"}` 문자열, `private.valid_numbers()` IMMUTABLE 함수 CHECK) · `group_no smallint CHECK(1~5)`(연금만, 로또 NULL) · UNIQUE(`batch_id, line_no`) | `batch_id`(RLS 조인용) |
| `saved_tickets` | `id uuid PK` · `user_id` · `game game_type NOT NULL` · `round int` · `ticket_data jsonb NOT NULL`(형식 로또 `{"nums":[1~45 정수 6개, 오름차순·중복 없음]}` / 연금 `{"group_no":1~5,"digits":"^[0-9]{6}$"}`, 추가 키 금지·숫자는 jsonb number 정수만 — IMMUTABLE 함수 `private.valid_ticket(game, ticket_data)` CHECK. 연금 5조 세트는 조마다 1행) · `purchase_status text NOT NULL CHECK(in 'favorite','purchased')` · `purchase_date date` · `amount_won bigint CHECK(>= 0)`(사용자가 입력한 **구매 금액**(원), 당첨금 아님) — CHECK: favorite이면 `purchase_date`·`amount_won` NULL, purchased이면 `purchase_date` NOT NULL · `source_number_id uuid FK→generated_numbers ON DELETE SET NULL`(생성 이력에서 저장한 경우, 같은 사용자의 생성 번호만 — 트리거 검사) · `idempotency_key uuid NOT NULL` · UNIQUE(`user_id, idempotency_key`) (R2) — 사용자 UPDATE는 열 단위 GRANT로 `purchase_status`·`purchase_date`·`amount_won`만(번호·회차·멱등 키 불변). BEFORE UPDATE 트리거: `purchased`→`favorite` 거부(SQLSTATE `PT422` → PostgREST 422 `INVALID_TRANSITION`, R19). 사용자 DELETE 허용(본인 기록 삭제 권리 — 삭제 후 재등록은 새 기록) | (`user_id`, `created_at desc`), (`game`, `round`, `purchase_status`)(판정 배치용), UNIQUE(`user_id, idempotency_key`) |
| `draw_checks` | `id uuid PK` · `ticket_id uuid NOT NULL FK→saved_tickets ON DELETE CASCADE` · `draw_no int NOT NULL` · `game game_type NOT NULL`(복합 FK `(ticket_id, game)`→saved_tickets(id, game)) · `matched_rank smallint`(등위 없음 = NULL) · `bonus_hit boolean NOT NULL DEFAULT false`(연금 보너스 당첨, CHECK: 로또면 false — 로또 2등은 rank=2) · 낙첨 = `matched_rank IS NULL AND NOT bonus_hit`(연금은 등위와 보너스 동시 당첨 가능) · `checked_at timestamptz NOT NULL` — 판정마다 행 누적(이력, R8) | (`ticket_id`, `draw_no`) |
| `waitlist_signups` | `id uuid PK` · `email text NOT NULL CHECK(length ≤ 254)` · `consent_marketing boolean NOT NULL CHECK(= true)` · `age_confirmed boolean NOT NULL CHECK(= true)`(만 19세 이상) · `email_norm text GENERATED ALWAYS AS (lower(trim(email)))` · `consented_at timestamptz NOT NULL DEFAULT now()` · `created_at timestamptz NOT NULL DEFAULT now()` — `user_id` 없음. 이중 확인(사용자 결정 2026-11-12): `confirmed_at timestamptz`(NULL = 미확인, 출시 알림은 확인된 행만) · `confirm_token_hash text`(sha256, 원문 저장 안 함) · `confirm_expires_at timestamptz`(발송 후 24시간) · `confirm_sends int`·`confirm_window_start timestamptz`(이메일별 확인 메일 24시간 3통 제한 — 제3자 메일 폭탄 방지). 미확인 행은 만료 후 pg_cron 삭제. `consented_at`은 미확인 동안 확인 링크를 발급한 신청 시각(미만료 링크가 있는 동안의 재신청은 아무것도 바꾸지 않음), 확인 시 확인 시각으로 한 번 확정(이후 불변). 확인 토큰 해시는 만료까지 유지(이미 확정된 토큰 재제출 = 200). 이 기능 이전의 미확인 행은 마이그레이션에서 즉시 만료 처리. 보관: 출시 알림 발송 직후 파기(task-044), 늦어도 6개월 — pg_cron `waitlist_purge_6m`(UTC 03:17)(R3·R21) | UNIQUE(`email_norm`)(중복 등록 방지 — 충돌은 RPC `waitlist_request_confirm` 한 번으로 처리 — 미확인 행만 갱신(`WHERE confirmed_at IS NULL`), 확인된 행의 동의 기록은 절대 덮어쓰지 않음, 응답은 같은 202, R21), `created_at`(보관 기간 삭제용) |
| `statistics_cache` | `game game_type` · `window_key text`(예약어 `window` 회피 — API 파라미터 이름은 A-06 `window` 유지) · `metric text` · PK(`game, window_key, metric`) · CHECK(`range_from <= range_to`, `sample_size >= 0`) · `payload jsonb NOT NULL` · `range_from int NOT NULL` · `range_to int NOT NULL` · `sample_size int NOT NULL` · `source text NOT NULL` · `updated_at timestamptz NOT NULL`(원본 2.3 필수 표기) | PK |
| `push_devices`(task-008 범위 밖 — 알림 작업에서 계정 전환 시 토큰 이전 설계와 함께 생성) | `id uuid PK` · `user_id` · `platform text NOT NULL CHECK(in 'android','ios','windows')` · `token text NOT NULL UNIQUE` · `notify_opt_in boolean NOT NULL DEFAULT false`(원본 10장 5 동의) · `last_seen_at timestamptz` | `user_id`, `token`(UNIQUE) |
| `subscription_accounts` | `id uuid PK` · `user_id` · `store text NOT NULL` · `product_id text NOT NULL` · `state text NOT NULL` · UNIQUE(`user_id, store, product_id`) — P2, 값 목록은 결제 결정(Q3) 후 | `user_id` |
| `fortune_profiles` | `user_id uuid PK`(1인 1행, 공통 규칙의 FK·CASCADE) · `birth_date date NOT NULL` CHECK(범위 팀장 결정 필요) · `calendar text NOT NULL CHECK(in 'solar','lunar')` · `is_leap_month boolean NOT NULL DEFAULT false`(음력만 의미) · `birth_time time`(NULL = 모름) · `consented_at timestamptz NOT NULL` · `updated_at timestamptz` — 성별 등 다른 항목 없음, P1([ADR-0005](adr/0005-fortune-numbers.md)) | PK(`user_id`) |

- 생성 출처: 운세·테마 번호 결과도 `generated_batches`·`generated_numbers`(generated 상태)에 그대로 저장하고 출처 값 `method` ∈ random · condition · zodiac · birthday · dream · saju만 추가한다(ADR-0005). `strategy`(엔진 전략)와 별개인 `method` 열로 둔다(팀장 결정, 아직 미적용 스키마라 정의를 직접 수정). 테마 입력값 자체는 저장하지 않는다.

## 3. RLS 정책
| 테이블 | anon | authenticated | 쓰기 주체 |
|---|---|---|---|
| `draws_lotto` · `draws_pension` | SELECT 전체(A-01~A-03 직접 읽기, R6) | SELECT 전체 | service_role만(워커·A-12) |
| `statistics_cache` | SELECT 전체(A-06 직접 읽기, R6) | SELECT 전체 | service_role만(재계산) |
| `ingestion_runs` | 없음 | 없음 | service_role만(워커·A-11~A-13·A-16 EF) |
| `waitlist_signups` | 없음(정책 없음 + `REVOKE ALL`, 직접 INSERT 우회 차단) | 없음 | service_role만 — A-15 EF가 Turnstile·레이트리밋 뒤 INSERT. 동의 강제는 테이블 CHECK |
| `private.rate_limits` | 없음(스키마 사용 권한 없음) | 없음 | service_role만 — `public.waitlist_rate_hit()`(INVOKER, `search_path=''`, service_role만 EXECUTE), pg_cron `rate_limits_purge`(UTC 03:27) |
| `generator_profiles` | 없음 | SELECT/INSERT/UPDATE/DELETE `USING/WITH CHECK ((select auth.uid()) = user_id)` | 본인 |
| `generated_batches` | 없음 | SELECT/INSERT/DELETE 본인(추가 전용 — UPDATE 없음, 생성 이력 위조 방지) | 본인 |
| `saved_tickets` | 없음 | SELECT/INSERT/DELETE 본인 + UPDATE 본인·열 단위(`purchase_status`·`purchase_date`·`amount_won`) | 본인 |
| `generated_numbers` | 없음 | SELECT/INSERT/DELETE `EXISTS(batch.user_id = (select auth.uid()))`(추가 전용) | 본인 |
| `draw_checks` | 없음 | SELECT `EXISTS(ticket.user_id = auth.uid())` | service_role만(A-09 판정) |
| `push_devices` | 없음 | SELECT/INSERT/UPDATE/DELETE 본인 | 본인 · 발송은 service_role |
| `subscription_accounts` | 없음 | SELECT 본인 | service_role만(스토어 영수증 검증, P2) |
| `fortune_profiles` | 없음 | SELECT/INSERT/UPDATE/DELETE `USING/WITH CHECK (auth.uid() = user_id)` | 본인(A-17) · 계정 삭제 시 CASCADE 파기 |

- service_role 키는 EF·워커에만(D9). 정책에 쓰는 컬럼(`user_id`, `batch_id`, `ticket_id`)은 2절 인덱스로 보장.

## 4. 연금 번호 앞자리 0 보존
| 위치 | 규칙 |
|---|---|
| DB | `char(6)` + CHECK `^[0-9]{6}$`. jsonb 안에서도 문자열(`"000719"`) |
| API | 요청·응답 JSON 문자열([04#1](04_API.md)), 숫자 필드 금지 |
| 워커 | 원본 값을 문자열로 파싱, 6자리 미만이면 `needs_review`(좌측 0 채우기로 자동 보정하지 않음 — 보정 허용 여부 팀장 결정 필요) |
| 클라이언트 | 표시·비교 모두 문자열. 자리별 비교는 오른쪽 끝부터(원본 2.2) |

## 5. 수집 provenance (D7, 원본 10장)
| 단계 | 기록 |
|---|---|
| 수집 | `ingestion_runs` 1행: `source_url`, `fetched_at`, `raw_payload`, `payload_sha256` |
| 검증 | 회차·날짜·번호 범위·중복·연금 0 보존 검사 → 통과 `verified`, 실패 `needs_review` + `validation_errors` |
| 반영 | `verified`·`approved`만 `draws_*` UPSERT(`ON CONFLICT (draw_no)`, 멱등). `ingestion_run_id`·`source_verified_at` 기록 |
| 재검증 | 관리자 A-16 실행 → `source_url` 재수집 후 저장된 `raw_payload`와 대조(R20) → `reverified_at` 기록, 불일치 시 `reverify_errors`(R9). 출처 접속 실패면 503, 기록 없음(승인 불가 유지) |
| 검토 | `needs_review`면 해당 게임 알림 발송 중단 → 관리자 A-12 승인(`reverified_at` 있고 `reverify_errors` NULL인 건만, UPSERT·캐시 재계산·발송 재개) / A-13 반려. `reviewed_by·reviewed_at·review_note`가 감사 기록. 관리자는 TOTP MFA 필수([04#1](04_API.md)) |
| 미확인 | 공식 데이터 수집·재배포 권한(Q1) — 확인 전 출시 불가 |
