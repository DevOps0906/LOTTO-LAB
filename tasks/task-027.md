# task-027 Windows D-05 내 번호 표 + CSV 내보내기

| 항목 | 내용 |
|---|---|
| 웨이브 | W4 |
| 선행 | task-022, task-024 |
| 위험도 | 보통 |
| 보안 영향 | 없음 (사용자 본인 로컬 데이터를 사용자가 직접 내보냄) |
| 담당 | builder → codex-reviewer(design) |
| 근거 | `spec D-05` · `docs/05_DATA_MODEL.md#4` |
| 쓰기 허용 | `packages/ui/src/screens/D-05/**`, `packages/app-core/src/export/**`, `apps/desktop/src/routes/**` |

## 할 것
- 넓은 표(선택·회차·복권·조·번호 문자열·구매일·금액·상태·판정·검증 시각), 상태 탭·필터·정렬
- CSV: 선택/필터 전체 범위·건수 미리보기, 연금 번호 문자열 보존(스프레드시트 숫자 변환 방지), 수식 주입 방지(`=`·`+`·`-`·`@` 시작 셀 이스케이프), 빈 CSV 방지

## 하지 않을 것
- 서버 업로드·공유 링크

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/app-core test -- export` 통과(`000719` 그대로, `=1+1` 셀 이스케이프)
- [ ] `pnpm --filter ./packages/ui test -- D-05` 통과
