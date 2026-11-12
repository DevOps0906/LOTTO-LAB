# task-020 모바일 M-04 통계

| 항목 | 내용 |
|---|---|
| 웨이브 | W3 |
| 선행 | task-015, task-017 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → codex-reviewer(design) + codex-reviewer(a11y) |
| 근거 | `spec M-04` · `docs/01_PRD.md#6` · `docs/04_API.md#1` A-06 |
| 쓰기 허용 | `packages/ui/src/screens/M-04/**`, `apps/mobile/src/routes/**` |

## 할 것
- 로또·연금 탭, 기간 20/50/100/전체, 빈도 막대·자리별 히트맵·조별 분포 + 차트 대체 표
- 모든 통계에 기간·표본 수·무작위 기준선·출처·갱신 시각·"미래 예측 아님" 표시
- 표본 없음·실패 시 마지막 정상 통계 유지·재시도

## 하지 않을 것
- 차트 라이브러리 추가는 팀장 승인 후(새 의존성이면 위험도 높음으로 전환)

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./packages/ui test -- M-04` 통과(필수 표기 5종 렌더 확인, 표본 0 → 기간 변경 CTA)
- [x] `grep -rE "확률 상승|당첨 확률이 높은" packages/ui/src/screens/M-04` 0건
