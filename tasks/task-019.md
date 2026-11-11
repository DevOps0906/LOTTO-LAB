# task-019 모바일 M-03 연금 생성

| 항목 | 내용 |
|---|---|
| 웨이브 | W3 |
| 선행 | task-017 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → codex-reviewer(design) |
| 근거 | `spec M-03` · `docs/01_PRD.md#9` 4·5 · `docs/05_DATA_MODEL.md#4` |
| 쓰기 허용 | `packages/ui/src/screens/M-03/**`, `apps/mobile/src/routes/**` |

## 할 것
- 조 1~5/자동, 십만~일 자리 라벨별 0~9/자동, 낱장·선택 조·5조 세트, 베이스 수와 총 장수 구분 표시
- 결과 표 `digits` 문자열 그대로 표시·복사·저장(앞자리 0 유지)
- 엔진 충돌 오류·요청 수 축소 안내

## 하지 않을 것
- 숫자 입력 필드(type=number) 사용 — 문자열 입력만

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/ui test -- M-03` 통과(`1조 000719` 입력→저장→복사 문자열이 `000719`, 5조 세트 5장)
- [ ] `pnpm --filter ./apps/mobile build` 성공
