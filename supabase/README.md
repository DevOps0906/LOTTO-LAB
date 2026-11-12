# supabase/ — 로컬 DB · Edge Function

## 도구 버전 (2026-11-12 고정)
| 도구 | 버전 | 실행 |
|---|---|---|
| Supabase CLI | 3.1.0 (npm 최신 stable) | `npx supabase@3.1.0 <명령>` |
| Deno (EF 단위 테스트) | 2.9.6 | `npx deno@2.9.6 <명령>` |
| Postgres | 17 (`config.toml [db] major_version`) | — |
| Edge Runtime | supabase-edge-runtime 1.78.1 (Deno 2 호환, CLI 내장) | — |

로컬 포트는 다른 프로젝트와 겹치지 않게 545xx를 쓴다(API 54521 · DB 54522 · Studio 54523).

## 명령
| 목적 | 명령 |
|---|---|
| 시작(필요 서비스만) | `npx supabase@3.1.0 start -x studio,imgproxy,realtime,storage-api,logflare,vector,supavisor,postgres-meta` (확인 메일 확인용 Mailpit 포함) |
| DB 초기화 | `npx supabase@3.1.0 db reset` |
| DB 테스트(pgTAP) | `npx supabase@3.1.0 test db` |
| EF 단위 테스트(오프라인) | `npx deno@2.9.6 test --no-prompt supabase/functions/` |
| EF 린트 | `npx deno@2.9.6 lint supabase/functions/` |
| EF 로컬 실행 | `npx supabase@3.1.0 functions serve --env-file <로컬 env 파일>` |
| 정지 | `npx supabase@3.1.0 stop` |

## 시드 (`seed.sql`)
- `db reset`(로컬) 때만 실행된다. 내용은 **합성 데이터만**(실제 회차 아님) — `source_url`은 `https://synthetic.invalid/…` 표식.
- 원격 프로젝트에 `db reset --linked`·`db push --include-seed` **금지**(원격 데이터 삭제·합성 회차 적재). 실제 회차 적재는 워커(task-029)만.
- 원격 배포 전·후 합성 표식 검사 — 행이 하나라도 있으면 예외로 중단한다:
  ```sql
  do $$ begin
    if exists (select 1 from public.ingestion_runs where source_url like 'https://synthetic.invalid/%')
       or exists (select 1 from public.draws_lotto where source_url like 'https://synthetic.invalid/%')
       or exists (select 1 from public.draws_pension where source_url like 'https://synthetic.invalid/%') then
      raise exception '합성 시드 행 발견(synthetic.invalid) — 배포 중단';
    end if;
  end $$;
  ```
- pgTAP(`tests/`)은 시드에 기대지 않고 트랜잭션 안에서 자체 데이터를 넣고 rollback 한다.

## waitlist (A-15) 환경변수
값은 저장소에 두지 않는다(로컬은 저장소 밖 env 파일, 운영은 `supabase secrets set`).
- 필수: `TURNSTILE_SECRET` · `TURNSTILE_HOSTNAMES`(쉼표 구분) · `RATE_SALT` · `ALLOWED_ORIGIN` — `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`는 런타임이 주입.
- 선택: `WAITLIST_RATE_WINDOW_SEC`(기본 600) · `WAITLIST_RATE_MAX`(기본 5).
- 확인 메일(task-003b) 필수, 기본값 없음(없거나 형식 오류면 500 fail-closed — URL은 https만, http는 `localhost`·`127.0.0.1`·`host.docker.internal`·`supabase_*`만, `CONFIRM_BASE_URL`은 origin만(경로·쿼리·프래그먼트·사용자 정보 거부)): `MAIL_API_URL`(송신 API 전체 URL) · `MAIL_API_KEY`(Bearer) · `MAIL_FROM`(발신 이메일) · `CONFIRM_BASE_URL`(웹 origin, 링크 `${CONFIRM_BASE_URL}/waitlist/confirm#token=…`).
- 로컬 메일은 Mailpit 송신 API(`POST /api/v1/send`)로 보낸다. **EF 컨테이너에서 닿는 주소(2026-11-12 실측, `functions serve` → Mailpit 수신 확인)**: `http://supabase_inbucket_LOTTO-LAB:8025/api/v1/send`(도커 내부 서비스명, 권장) · `http://host.docker.internal:54524/api/v1/send`(Docker Desktop) 둘 다 동작. `127.0.0.1`은 컨테이너 자신이라 안 된다. 받은 메일은 `http://127.0.0.1:54524`에서 본다. 로컬 `MAIL_API_KEY`는 아무 값(Mailpit은 무시).
- 운영 메일 서비스는 미정(사용자 결정) — 정해지면 `functions/_shared/mailer.ts`의 요청 본문만 맞춘다.
- 로컬 Turnstile은 Cloudflare 테스트 키(항상 통과 secret `1x0000000000000000000000000000000AA`, hostname `example.com`)로 확인한다.

## waitlist-confirm (A-19) 환경변수
- 필수: `RATE_SALT` · `ALLOWED_ORIGIN`(A-15와 같은 값) — 레이트리밋 한도는 `WAITLIST_RATE_WINDOW_SEC`·`WAITLIST_RATE_MAX`를 같이 쓰고 키만 `confirm:` 접두로 분리.

## 통합 테스트 (로컬 스택 + Mailpit 필요)
`WAITLIST_IT_URL=http://127.0.0.1:54521 WAITLIST_IT_SERVICE_KEY=<npx supabase@3.1.0 status의 SERVICE_ROLE_KEY> WAITLIST_IT_MAILPIT=http://127.0.0.1:54524 npx deno@2.9.6 test --no-prompt --allow-env --allow-net=127.0.0.1:54521,127.0.0.1:54524 supabase/functions/`
— 세 환경변수가 없으면 통합 테스트는 건너뛰고 단위 테스트만 돈다. 신청 → Mailpit 메일 → 링크 토큰으로 A-19 → 재제출·위조·재신청·4번째 신청을 확인한다.

## 배포 체크리스트 (waitlist, 운영 반영 전·직후)
- [ ] 운영에서 클라이언트 IP 헤더 실측: `x-real-ip`·`x-forwarded-for`(맨 오른쪽)가 실제 클라이언트 IP인지, 위조 헤더가 덮어써지는지 확인. 다르면 `functions/_shared/ip.ts`의 `CLIENT_IP_HEADERS`만 고친다. 로그에 `ip_unknown`이 잦으면 모든 요청이 공통 키 하나로 묶인 상태다.
- [ ] 노출 스키마 확인: API 설정의 exposed schemas에 `private`가 없는지, `waitlist_signups`·`waitlist_rate_hit`·`waitlist_request_confirm`·`waitlist_confirm`이 anon·authenticated로 거부되는지(42501).
- [ ] Turnstile `action`(위젯 action 값) 검사를 추가할지 결정 — 현재는 `success`와 `hostname`(`TURNSTILE_HOSTNAMES`)만 검사.
- [ ] 필수 secret 설정(`supabase secrets set`): `TURNSTILE_SECRET`·`TURNSTILE_HOSTNAMES`·`RATE_SALT`·`ALLOWED_ORIGIN`·`MAIL_API_URL`·`MAIL_API_KEY`·`MAIL_FROM`·`CONFIRM_BASE_URL`.
- [ ] 운영 메일: 발신 도메인 SPF·DKIM·DMARC, 확인 메일 문의처(`_shared/mailer.ts` `CONTACT_LINE`) 기재, `waitlist-confirm` 배포(verify_jwt=false).
- [ ] 운영 `EdgeRuntime.waitUntil` 동작 확인: 신청 후 확인 메일이 실제 도착하는지, 로그에 `wait_until_unsupported`·`mail_failed`가 없는지(미지원이면 A-15가 500으로 막힌다).
- [ ] pg_cron 작업 3개가 `cron.job`에 있고 `cron.job_run_details`에 실패가 없는지.

## pg_cron 작업 (UTC)
| 이름 | 일정 | 내용 |
|---|---|---|
| `waitlist_purge_6m` | 매일 03:17 | `waitlist_signups.created_at` 6개월 지난 행 삭제 |
| `rate_limits_purge` | 매일 03:27 | `private.rate_limits` 1일 지난 창 삭제 |
| `waitlist_purge_unconfirmed` | 매시 47분 | 미확인(`confirmed_at` NULL)·확인 만료(`confirm_expires_at` 지남) 행 삭제 |
