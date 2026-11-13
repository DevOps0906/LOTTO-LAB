# task-004 웹 랜딩 W-01 + 사전알림 신청 폼

| 항목 | 내용 |
|---|---|
| 웨이브 | W0 |
| 선행 | task-003 |
| 위험도 | 높음 |
| 보안 영향 | 노출 면(공개 페이지·폼) · 의존성(Next.js 최초 도입) |
| 담당 | builder → codex-reviewer(design) + reviewer(security) |
| 근거 | `spec W-01` · `spec W-05` · `docs/04_API.md#1` A-19 · `docs/03_SCREENS_UX.md` W-01 행 · `docs/04_API.md#1` A-15 · `docs/01_PRD.md#6` 금지 문구 · `DESIGN.md` |
| 쓰기 허용 | `apps/web/**` (랜딩 경로만) |

## 할 것
- Next.js(착수 시 최신 stable 확인·버전 기록) 랜딩: hero·안내 카드·FAQ·푸터, 반응형 3구간
- 폼: 이메일·수신 동의·만 19세 확인 전 신청 비활성, Turnstile 위젯, 400·429·완료 상태(`spec W-01` 상태 4종)
- 설치 버튼은 배포 전 "준비 중" 모달만(실제 배포 URL 없으면 링크 없음)
- 이중 확인(사용자 결정 2026-11-12): 신청 완료 상태 문구는 "확인 메일을 보냈어요 — 메일의 링크로 신청을 확정해 주세요". W-05 `/waitlist/confirm?token=` 화면: 버튼 클릭 시에만 A-19 POST(자동 확정 금지), 400·429·503·성공 상태

## 하지 않을 것
- 관리자 화면(task-032·033), 분석 도구 연동(팀장 결정 필요, `01#5`)

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm --filter ./apps/web build` 성공
- [x] `pnpm --filter ./apps/web test` 통과(필수 체크 전 버튼 비활성, 400·429 입력 보존)
- [x] `grep -rE "당첨 보장|확률 상승|과학적으로 추천" apps/web/src` 결과 0건
