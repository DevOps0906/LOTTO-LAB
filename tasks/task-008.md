# task-008 Supabase 사용자 스키마 + RLS·상태 전환 트리거

| 항목 | 내용 |
|---|---|
| 웨이브 | W1 |
| 선행 | task-007 |
| 위험도 | 높음 (challenger 착수 전 검토) |
| 보안 영향 | 마이그레이션 · RLS · 민감 데이터(구매·당첨 이력) |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | `docs/05_DATA_MODEL.md#2` `#3` · `docs/04_API.md#1` A-07·A-14 메모 · R2·R8·R18·R19 |
| 쓰기 허용 | `supabase/migrations/*user*`, `supabase/tests/user*` (문서 04·05는 팀장이 갱신) |

## 할 것
- `generator_profiles`·`generated_batches`·`generated_numbers`·`saved_tickets`·`draw_checks` 생성(`push_devices`는 알림 작업에서 토큰 이전 설계와 함께)
- RLS 본인 행만, `draw_checks` 쓰기 service_role만, UNIQUE(user_id, idempotency_key)
- BEFORE UPDATE 트리거: purchased→favorite 거부. `draw_checks.matched_rank` 연금 보너스 표기는 팀장 결정 필요

## 하지 않을 것
- `subscription_accounts`(P2, Q3 후), Edge Function A-09(P1)

## 완료 조건 (실행 가능한 확인)
- [x] `supabase db reset` 성공
- [x] `supabase test db` 통과: 타 사용자 행 SELECT 0행·UPDATE 거부, 역전환 거부, 같은 idempotency_key 두 번째 INSERT 거부, 사용자 `draw_checks` INSERT 거부
