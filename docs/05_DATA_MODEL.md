# 05 데이터 모델 — LOTTO LAB

> ERD: [`diagrams/erd.mmd`](diagrams/erd.mmd) — `sql2erd supabase/migrations -o docs/diagrams/erd.mmd` 로 생성 예정(손으로 그리지 않음).
> 근거: `LOTTO_LAB_PRD.md#2`·`#8`·`#10` · `PLAN_BRIEF.md` D4~D7·D9 · [`REVIEW_doc.md`](REVIEW_doc.md) R2·R3·R6~R9. API 매핑은 [`04_API.md#1`](04_API.md).

## 1. 공통 규칙
- DB: Supabase Postgres. 모든 테이블 RLS 활성(정책 없는 테이블 = 클라이언트 접근 차단).
- `game`: enum `game_type` = `lotto` | `pension`.
- 사용자 테이블은 `user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE`(계정 삭제 시 함께 삭제, 원본 11장). 보관 기간 정책 팀장 결정 필요.
- 공통 시각 컬럼: `created_at timestamptz NOT NULL DEFAULT now()`(표에서 생략).
- 게스트 데이터는 기기 로컬에만 저장(D6), 로그인 후 동기화(P1) 시 아래 사용자 테이블로 올린다.

## 2. 테이블
| 테이블 | 컬럼 · 타입 · 제약 | 인덱스 |
|---|---|---|
| `draws_lotto` | `draw_no int PK CHECK(>0)` · `draw_date date NOT NULL UNIQUE` · `nums smallint[] NOT NULL` CHECK(길이 6, 각 1~45, 중복 없음, 오름차순) · `bonus smallint NOT NULL` CHECK(1~45, `nums`에 없음) · `prizes jsonb NOT NULL`(등위별 `[{rank, amount_won, winners}]`, R7) · `source_url text NOT NULL` · `ingestion_run_id uuid NOT NULL FK→ingestion_runs` · `source_verified_at timestamptz NOT NULL` | PK, `draw_date` |
| `draws_pension` | `draw_no int PK CHECK(>0)` · `draw_date date NOT NULL UNIQUE` · `group_no smallint NOT NULL CHECK(1~5)` · `digits char(6) NOT NULL CHECK(digits ~ '^[0-9]{6}$')` · `bonus_digits char(6) NOT NULL CHECK(~ '^[0-9]{6}$')` · `prizes jsonb NOT NULL`(등위별 당첨금·인원, 로또와 같은 형식) · `source_url text NOT NULL` · `ingestion_run_id uuid NOT NULL FK` · `source_verified_at timestamptz NOT NULL` | PK, `draw_date` |
| `ingestion_runs` | `id uuid PK` · `game game_type NOT NULL` · `draw_no int NOT NULL` · `source_url text NOT NULL` · `fetched_at timestamptz NOT NULL` · `payload_sha256 text NOT NULL` · `raw_payload jsonb NOT NULL` · `status text NOT NULL CHECK(in 'verified','needs_review','approved','rejected')` · `validation_errors jsonb` · `reverified_at timestamptz` · `reverify_errors jsonb`(NULL = 통과, R9) · `reviewed_by uuid FK→auth.users` · `reviewed_at timestamptz` · `review_note text` · UNIQUE(`game, draw_no, payload_sha256`) | (`status`, `fetched_at desc`), (`game`, `draw_no`) |
| `generator_profiles` | `id uuid PK` · `user_id` · `game game_type NOT NULL` · `name text NOT NULL` · `config jsonb NOT NULL`(조건 프리셋, 원본 4.3·4.4) · `updated_at timestamptz` | `user_id` |
| `generated_batches` | `id uuid PK` · `user_id` · `game game_type NOT NULL` · `round int`(대상 회차) · `strategy text NOT NULL`(원본 5장 전략 키) · `method text NOT NULL DEFAULT 'random' CHECK(in 'random','condition','zodiac','birthday','dream','saju')`(생성 출처, ADR-0005) · `engine_version text NOT NULL` | (`user_id`, `created_at desc`) |
| `generated_numbers` | `id uuid PK` · `batch_id uuid NOT NULL FK→generated_batches ON DELETE CASCADE` · `line_no smallint NOT NULL` · `numbers jsonb NOT NULL`(로또 정수 6개 / 연금 `{"digits":"000719"}` 문자열) · `group_no smallint CHECK(1~5)`(연금만, 로또 NULL) · UNIQUE(`batch_id, line_no`) | `batch_id`(RLS 조인용) |
| `saved_tickets` | `id uuid PK` · `user_id` · `game game_type NOT NULL` · `round int` · `ticket_data jsonb NOT NULL`(04#5 입력 검증 + CHECK: 연금 `digits` 문자열 6자리) · `purchase_status text NOT NULL CHECK(in 'favorite','purchased')` · `purchase_date date` · `amount_won int CHECK(>= 0)` · `source_number_id uuid FK→generated_numbers ON DELETE SET NULL`(생성 이력에서 저장한 경우) · `idempotency_key uuid NOT NULL` · UNIQUE(`user_id, idempotency_key`) (R2) — BEFORE UPDATE 트리거: `purchased`→`favorite` 전환 거부(→ 04 A-14 422 `INVALID_TRANSITION`, R19) | (`user_id`, `created_at desc`), (`game`, `round`, `purchase_status`)(판정 배치용), UNIQUE(`user_id, idempotency_key`) |
| `draw_checks` | `id uuid PK` · `ticket_id uuid NOT NULL FK→saved_tickets ON DELETE CASCADE` · `draw_no int NOT NULL` · `matched_rank smallint`(NULL = 낙첨, 연금 보너스 표기 방식 팀장 결정 필요) · `checked_at timestamptz NOT NULL` — 판정마다 행 누적(이력, R8) | (`ticket_id`, `draw_no`) |
| `waitlist_signups` | `id uuid PK` · `email text NOT NULL CHECK(length ≤ 254)` · `consent_marketing boolean NOT NULL CHECK(= true)` · `age_confirmed boolean NOT NULL CHECK(= true)`(만 19세 이상) · `email_norm text GENERATED ALWAYS AS (lower(trim(email)))` · `consented_at timestamptz NOT NULL DEFAULT now()` · `created_at timestamptz NOT NULL DEFAULT now()` — `user_id` 없음. 보관: 출시 알림 발송 직후 파기(task-044), 늦어도 6개월 — pg_cron `waitlist_purge_6m`(UTC 03:17)(R3·R21) | UNIQUE(`email_norm`)(중복 등록 방지 — 충돌은 `ON CONFLICT DO UPDATE SET consented_at`(재신청 시 동의 시각 갱신), 응답은 같은 202, R21), `created_at`(보관 기간 삭제용) |
| `statistics_cache` | `game game_type` · `window text` · `metric text` · PK(`game, window, metric`) · `payload jsonb NOT NULL` · `range_from int NOT NULL` · `range_to int NOT NULL` · `sample_size int NOT NULL` · `source text NOT NULL` · `updated_at timestamptz NOT NULL`(원본 2.3 필수 표기) | PK |
| `push_devices` | `id uuid PK` · `user_id` · `platform text NOT NULL CHECK(in 'android','ios','windows')` · `token text NOT NULL UNIQUE` · `notify_opt_in boolean NOT NULL DEFAULT false`(원본 10장 5 동의) · `last_seen_at timestamptz` | `user_id`, `token`(UNIQUE) |
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
| `generator_profiles` · `generated_batches` · `saved_tickets` | 없음 | SELECT/INSERT/UPDATE/DELETE `USING/WITH CHECK (auth.uid() = user_id)` | 본인 |
| `generated_numbers` | 없음 | 전체 작업 `EXISTS(batch.user_id = auth.uid())` | 본인 |
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
