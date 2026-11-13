# task-018 모바일 M-02 로또 생성

| 항목 | 내용 |
|---|---|
| 웨이브 | W3 |
| 선행 | task-017 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → codex-reviewer(design) |
| 근거 | `spec M-02` · `docs/01_PRD.md#9` 1·2·3·6 · `docs/02_ARCHITECTURE.md#3` DF-1 |
| 쓰기 허용 | `packages/ui/src/screens/M-02/**`, `apps/mobile/src/routes/**` |

## 할 것
- 1~45 격자 고정/제외 분리 선택(재탭 해제), 게임 수 1~50, 기기 생성(오프라인)
- 엔진 오류는 조건 완화·게임 수 축소 제안, 중복 제출 잠금·취소, 저장 실패 시 결과 보존
- 선택 저장(즐겨찾기)·복사·공유. 고급 조건 탭은 P1 표시

## 하지 않을 것
- 서버 생성 호출(D4), 통계 기반 추천 문구

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./packages/ui test -- M-02` 통과(불가능 조건 → 오류·해결 방안 표시, 저장 후 상태 "추천/즐겨찾기"이며 구매 아님)
- [x] `pnpm --filter ./apps/mobile build` 성공
