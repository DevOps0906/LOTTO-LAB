# 기획 브리프 — LOTTO LAB (팀장 결정, 2026-11-12)

> 원본: `LOTTO_LAB_PRD.md`(v1.0) · `LOTTO_LAB_Planning_Design.pdf`(3쪽 = 모바일 시안 4화면). docs/가 생기면 docs/가 정본, 원본은 참고용.

## 확정 결정
| # | 결정 |
|---|---|
| D1 | 배포 3면: **모바일 앱** Capacitor 8(Android 먼저, iOS는 macOS 필요) · **Windows 설치형** Tauri 2(MSI/NSIS) · **웹** Next.js(랜딩 + 관리자, P1 — 사용자 미확인 가정) |
| D2 | 모바일 디자인 = PDF 시안(하단 탭 4개: 홈·추천·통계·내번호). Windows = **모바일 디자인 + 사이드바·그리드 배치**(시각 언어는 모바일 시안과 동일, 좌측 사이드바 + 2~3열 그리드, 생성 조건과 결과를 한 화면 좌우 배치) — [ADR-0004](adr/0004-pc-uses-mobile-visual-language.md) |
| D3 | 코드 공유: `packages/ui`(컴포넌트) · `packages/app-core`(상태·API 클라이언트·화면 로직) · 엔진/통계/검증/타입 패키지. 레이아웃 셸만 앱별(`apps/mobile` 탭바, `apps/desktop` 사이드바) |
| D4 | 번호 생성은 TS 엔진을 **기기에서 실행**(즉시·오프라인). 서버는 저장·결과 조회·당첨 판정·통계 캐시 |
| D5 | 백엔드: Supabase(Auth·Postgres·RLS). 사용자 CRUD는 RLS 직접, 회차/통계/판정은 Edge Function(`/v1/*` 계약 유지) |
| D6 | 게스트 사용 가능(생성·로컬 저장). 로그인하면 클라우드 동기화(P1). 첫 실행 만 19세 확인(P0) |
| D7 | 공식 회차는 Python 워커가 수집→검증→UPSERT(출처·검증 시각 기록). 오류 시 발송 중단·관리자 검토 |
| D8 | 문구: "과학적으로 추천" 금지 → "데이터로 살펴보는". 당첨 보장·확률 상승 표현 금지 |
| D9 | 보안 레벨 L2(앱 배포 + 개인정보 + 공개 API). 서비스 키는 앱 번들 금지 |
| D10 | 화면 ID: 모바일 `M-xx` · Windows `D-xx` · 웹 `W-xx`. API `A-xx`. 반응형 3구간(~767/768~1199/1200~); Windows 창 최소 1024×700(768~1199 구간은 사이드바 아이콘형) |

## 미결 질문 (사용자 확인 필요)
| # | 질문 | 기본 가정 |
|---|---|---|
| Q1 | 동행복권 결과 데이터 수집·재배포 권한(약관) | 확인 전 출시 불가 — 법률 확인 작업으로 등록 |
| Q2 | Next.js 웹 유지 여부 | 랜딩+관리자 유지(P1) |
| Q3 | Windows 배포 경로·결제(직접 MSI vs Microsoft Store) | 직접 배포 + 자동 업데이트, 유료는 P2에서 결정 |
| Q4 | Windows 코드 서명 인증서 | 출시 전 구매(OV/EV) 필요 |
| Q5 | 린 검증(랜딩+사전알림 신청) 실행 여부 | W0 작업으로 진행 |

## 문서 목차와 담당
| 문서 | 담당 | 근거 |
|---|---|---|
| `00_LEAN.md` · `01_PRD.md` | planner A | 원본 PRD 1·3·11·12·13·14장 |
| `02_ARCHITECTURE.md` · `adr/0001~0003` | planner B | 원본 7장 + D1·D3~D7 |
| `04_API.md` · `05_DATA_MODEL.md` | planner C | 원본 8·9·10장 + D4·D5 |
| `03_SCREENS_UX.md` · `benchmark.md` | codex-designer (planner 교차 검토) | 원본 3·4·5장 + PDF 시안 + D2·D10 |
| `DESIGN.md` · 토큰 · 미리보기 | designer | 원본 6장 + PDF 시안 색 + D2·D10 |
