# task-021 모바일 M-16 회차 목록 + M-11 공식 회차 상세

| 항목 | 내용 |
|---|---|
| 웨이브 | W3 |
| 선행 | task-017 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → codex-reviewer(design) |
| 근거 | `spec M-16` · `spec M-11` · `docs/01_PRD.md#9` 7 · `docs/04_API.md#1` A-01~A-03 |
| 쓰기 허용 | `packages/ui/src/screens/{M-16,M-11}/**`, `apps/mobile/src/routes/**` |

## 할 것
- M-16: 회차 검색·복권/기간 필터·검증 상태·출처·검증 시각, 페이지네이션
- M-11: 추첨일·번호/보너스(연금 조·문자열·보너스 분리), 등위·일치 기준·당첨금 표, 출처 링크·검증 시각, 이전/다음 회차
- 미수집 회차 → 미갱신 안내, 캐시 없으면 결과 미제공

## 하지 않을 것
- 관리자 수집 상태 노출

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/ui test -- M-16 M-11` 통과(모든 상세에 출처·검증 시각 존재, 0행 → 미갱신)
- [ ] `pnpm --filter ./apps/mobile build` 성공
