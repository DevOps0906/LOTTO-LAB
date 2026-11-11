# task-031 관리자 Edge Function: A-11·A-12·A-13·A-16

| 항목 | 내용 |
|---|---|
| 웨이브 | W5 |
| 선행 | task-029 |
| 위험도 | 높음 (challenger 착수 전 검토) |
| 보안 영향 | 관리자 노출 면 · 인증(admin role + aal2 MFA) · 키·권한(service_role) |
| 담당 | builder → codex-reviewer(code) + reviewer(security) → tester |
| 근거 | `docs/04_API.md#1` A-11~A-13·A-16·관리자 판별 메모 · `#2` · `#4` · `#5` · `docs/05_DATA_MODEL.md#5` · R9·R13·R20·R22·R24 |
| 쓰기 허용 | `supabase/functions/admin-*/**`, `supabase/tests/admin*` |

## 할 것
- 공통: `app_metadata.role="admin"` AND `aal="aal2"` 확인 후에만 service_role 사용, 403 `FORBIDDEN`/`MFA_REQUIRED` 구분
- A-16(R20·R24): `source_url` 재수집 → 해시가 아닌 정규화 필드(회차·날짜·번호·보너스·prizes) 비교 → `reverified_at`·`reverify_errors` 기록, 접속 실패 503
- A-12: 재검증 통과 건만 승인(409 `NOT_REVERIFIED`), UPSERT → 통계 재계산 트리거. A-13 반려 사유 필수
- R22: 관리자 레이트리밋 수치 측정 후 `04#4`에 기록

## 하지 않을 것
- 관리자 역할 부여 UI(service_role로만 부여), 웹 화면(task-032·033)

## 완료 조건 (실행 가능한 확인)
- [ ] `supabase functions serve` 상태 테스트 통과: 비관리자 403, aal1 관리자 403 `MFA_REQUIRED`, 미재검증 승인 409, 처리된 run 재처리 409
- [ ] 정규화 비교 단위 테스트: 필드 순서·공백 차이는 통과, 번호 1개 차이는 실패
