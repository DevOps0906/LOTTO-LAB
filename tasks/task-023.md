# task-023 모바일 M-09 수동 구매등록 + M-12 설정(P0 범위)

| 항목 | 내용 |
|---|---|
| 웨이브 | W3 |
| 선행 | task-022 |
| 위험도 | 보통 |
| 보안 영향 | 없음 |
| 담당 | builder → codex-reviewer(design) |
| 근거 | `spec M-09` · `spec M-12` · `docs/04_API.md#1` A-07·A-14 메모(R2·R18·R19) |
| 쓰기 허용 | `packages/ui/src/screens/{M-09,M-12}/**`, `apps/mobile/src/routes/**` |

## 할 것
- M-09: 복권·회차·번호(연금 조·여섯 자리 문자열)·구매일·금액(원)·원본 연결·실제 구매 확인 체크, 같은 멱등 키 재사용, 필드 옆 오류·입력 보존
- M-12: 테마(다크모드)·권한 상태·약관 링크. 알림·로그인·동기화·계정 삭제는 P1 표시

## 하지 않을 것
- QR 등록 M-10, 푸시 등록(`push_devices`, P1)

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/ui test -- M-09 M-12` 통과(확인 체크 전 확정 비활성, 두 번 제출해도 1건, 연금 `000719` 보존)
- [ ] `pnpm --filter ./apps/mobile build` 성공
