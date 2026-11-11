# task-007 Supabase 공개·수집 스키마 + RLS (draws_*·ingestion_runs·statistics_cache)

| 항목 | 내용 |
|---|---|
| 웨이브 | W1 |
| 선행 | task-003 |
| 위험도 | 높음 (challenger 착수 전 검토) |
| 보안 영향 | 마이그레이션 · RLS |
| 담당 | builder (+ intern: 로컬 시드) → codex-reviewer(code) + reviewer(security) |
| 근거 | `docs/05_DATA_MODEL.md#1` `#2` `#3` `#4` `#5` · `docs/adr/0003-supabase-rls-edge-function.md` · R6·R7 |
| 쓰기 허용 | `supabase/migrations/*public*`, `supabase/seed.sql`, `supabase/tests/public*` |

## 할 것
- `game_type` 타입, 4개 테이블 CHECK·인덱스(연금 `char(6)` 정규식, 로또 6개 중복 없음·오름차순)
- RLS: `draws_*`·`statistics_cache` anon/authenticated SELECT만, `ingestion_runs` 접근 없음(service_role만)
- 로컬 시드는 합성 데이터임을 주석에 표시(실제 회차 아님)

## 하지 않을 것
- 사용자 테이블(task-008), 실제 회차 적재(task-029)

## 완료 조건 (실행 가능한 확인)
- [ ] `supabase db reset` 성공
- [ ] `supabase test db` 통과: anon INSERT/UPDATE 거부, `ingestion_runs` anon SELECT 0행, `digits='719'`·중복 번호 INSERT 거부
