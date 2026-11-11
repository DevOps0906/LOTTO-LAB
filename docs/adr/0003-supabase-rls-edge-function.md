# ADR-0003 Supabase: 사용자 CRUD·공개 회차 읽기는 RLS 직접, 판정·관리자·waitlist는 Edge Function

- 상태: 채택
- 날짜: 2026-11-12

| 항목 | 내용 |
|---|---|
| 맥락 | 백엔드는 Supabase(Auth · Postgres · RLS)로 정했다(D5). 사용자 데이터 CRUD나 공개 회차·통계 읽기에 별도 API 서버를 두면 비용·코드가 늘고, 회차·통계 쓰기와 관리자 작업은 클라이언트가 직접 하면 안 된다. 보안 레벨 L2, 서비스 키 앱 번들 금지(D9). |
| 선택 | 내 번호·설정 등 사용자 소유 데이터는 Supabase JS + 사용자 JWT로 직접 CRUD하고 RLS(`auth.uid()` = 소유자)로 막는다. 공개 읽기(`draws_*` · `statistics_cache`)는 anon SELECT RLS로 직접 허용한다(쓰기 정책 없음). Edge Function `/v1/*`은 당첨 판정(P1, A-09)·관리자·waitlist만 맡는다. 회차 쓰기는 Python 워커만 서버 키로 수행(D7). 클라이언트는 anon 키만 가진다. |
| 대안 | ① 전부 Edge Function 경유: 단순 CRUD·공개 읽기까지 함수 코드·지연 증가로 기각. ② 전부 RLS 직접: 서버 판정·관리자 권한을 클라이언트에 둘 수 없어 기각. ③ 별도 API 서버(FastAPI 등): 운영 대상 추가로 기각. |
| 결과 | 얻음: 사용자 CRUD·공개 읽기는 서버 코드 0, 판정·관리자는 계약(`/v1/*`)으로 버전 관리. 잃음: 보안이 RLS 정책 정확성에 달림 → 테이블마다 정책 테스트 필수(공개 테이블은 anon 쓰기 거부 확인), 공개 테이블 스키마가 곧 클라이언트 계약, Supabase 종속. 되돌리기: `/v1/*` 계약을 유지하면 함수 구현만 다른 서버로 이전 가능(중간). |

- 판정 함수는 `lottery-core` 하나(ADR-0002, R1). 흐름: [02_ARCHITECTURE.md#3 DF-4·DF-5](../02_ARCHITECTURE.md)
- 상세: [04_API.md](../04_API.md) · [05_DATA_MODEL.md](../05_DATA_MODEL.md) · 보안 [01_PRD.md#8](../01_PRD.md)
