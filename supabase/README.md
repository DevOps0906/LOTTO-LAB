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
| 시작(필요 서비스만) | `npx supabase@3.1.0 start -x studio,imgproxy,realtime,storage-api,logflare,vector,supavisor,mailpit,postgres-meta` |
| DB 초기화 | `npx supabase@3.1.0 db reset` |
| DB 테스트(pgTAP) | `npx supabase@3.1.0 test db` |
| EF 단위 테스트(오프라인) | `npx deno@2.9.6 test --no-prompt supabase/functions/waitlist/` |
| EF 로컬 실행 | `npx supabase@3.1.0 functions serve --env-file <로컬 env 파일>` |
| 정지 | `npx supabase@3.1.0 stop` |

## waitlist (A-15) 환경변수
값은 저장소에 두지 않는다(로컬은 저장소 밖 env 파일, 운영은 `supabase secrets set`).
- 필수: `TURNSTILE_SECRET` · `TURNSTILE_HOSTNAMES`(쉼표 구분) · `RATE_SALT` · `ALLOWED_ORIGIN` — `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`는 런타임이 주입.
- 선택: `WAITLIST_RATE_WINDOW_SEC`(기본 600) · `WAITLIST_RATE_MAX`(기본 5).
- 로컬 Turnstile은 Cloudflare 테스트 키(항상 통과 secret `1x0000000000000000000000000000000AA`, hostname `example.com`)로 확인한다.

## 통합 테스트 (로컬 스택 필요)
`WAITLIST_IT_URL=http://127.0.0.1:54521 WAITLIST_IT_SERVICE_KEY=<npx supabase@3.1.0 status의 SERVICE_ROLE_KEY> npx deno@2.9.6 test --no-prompt --allow-env --allow-net=127.0.0.1:54521 supabase/functions/waitlist/`
— 두 환경변수가 없으면 통합 테스트는 건너뛰고 단위 테스트만 돈다.

## 배포 체크리스트 (waitlist, 운영 반영 전·직후)
- [ ] 운영에서 클라이언트 IP 헤더 실측: `x-real-ip`·`x-forwarded-for`(맨 오른쪽)가 실제 클라이언트 IP인지, 위조 헤더가 덮어써지는지 확인. 다르면 `functions/waitlist/ip.ts`의 `CLIENT_IP_HEADERS`만 고친다. 로그에 `ip_unknown`이 잦으면 모든 요청이 공통 키 하나로 묶인 상태다.
- [ ] 노출 스키마 확인: API 설정의 exposed schemas에 `private`가 없는지, `waitlist_signups`·`waitlist_rate_hit`가 anon·authenticated로 거부되는지(42501).
- [ ] Turnstile `action`(위젯 action 값) 검사를 추가할지 결정 — 현재는 `success`와 `hostname`(`TURNSTILE_HOSTNAMES`)만 검사.
- [ ] 필수 secret 설정(`supabase secrets set`): `TURNSTILE_SECRET`·`TURNSTILE_HOSTNAMES`·`RATE_SALT`·`ALLOWED_ORIGIN`.
- [ ] pg_cron 작업 2개가 `cron.job`에 있고 `cron.job_run_details`에 실패가 없는지.

## pg_cron 작업 (UTC)
| 이름 | 일정 | 내용 |
|---|---|---|
| `waitlist_purge_6m` | 매일 03:17 | `waitlist_signups.created_at` 6개월 지난 행 삭제 |
| `rate_limits_purge` | 매일 03:27 | `private.rate_limits` 1일 지난 창 삭제 |
