# 02 아키텍처 — LOTTO LAB

> 그림: [`diagrams/architecture.mmd`](diagrams/architecture.mmd) — 코드가 생기면 `deps2mmd`로 다시 생성
> 결정 근거: [ADR-0001 셸 2개·코드 공유](adr/0001-capacitor-tauri-shared-core.md) · [ADR-0002 엔진 기기 실행](adr/0002-engine-on-device.md) · [ADR-0003 RLS+Edge Function](adr/0003-supabase-rls-edge-function.md)
> 버전: Capacitor 8 · Tauri 2는 결정된 메이저다. 마이너·패치와 그 밖의 도구(Vite·React·Next.js·pnpm·Turborepo)는 **착수 시 최신 stable 확인** 후 이 문서에 적는다.
> 확정(2026-11-12, task-005): pnpm 10.34.8 · Turborepo 2.11.11 · TypeScript 6.0.3(typescript-eslint 8.72.2가 TS 7 미지원 → 6.x 통일) · ESLint 10.14.0 · typescript-eslint 8.72.2 · Next.js 16.4.6 · React 19.3.1 · Vite 8.3.8 · Node ≥20.9.0

## 1. 구성 요소
| 요소 | 책임 | 기술 | 소유 경로 |
|---|---|---|---|
| 모바일 셸 | 하단 탭 4개 레이아웃, 네이티브 플러그인 연결 | Vite + React + Capacitor 8 (Android 먼저) | `apps/mobile` |
| Windows 셸 | 사이드바 대시보드 레이아웃, 설치·자동 업데이트(P1) | Vite + React + Tauri 2 (MSI/NSIS) | `apps/desktop` |
| 웹 (P1, 가정) | 랜딩 · 관리자 | Next.js App Router | `apps/web` |
| 공유 UI | 화면 컴포넌트(셸 무관) | React | `packages/ui` · `packages/design-tokens` |
| 앱 코어 | 상태·API 클라이언트·화면 로직·플랫폼 어댑터 인터페이스 | TypeScript | `packages/app-core` |
| 엔진 | 로또·연금 번호 생성(기기 실행), 당첨 판정 함수(`lottery-core`, 기기·서버 공용 단일 함수) | TypeScript, 순수 함수 | `packages/lotto-engine` · `pension-engine` · `lottery-core` |
| 통계·검증·타입 | 통계 계산, Zod 스키마, DTO | TypeScript + Zod | `packages/statistics` · `validation` · `types` |
| 백엔드 | 인증, 사용자 데이터(RLS), 회차·통계 공개 읽기(anon SELECT RLS), 판정·관리자·waitlist API(Edge Function) | Supabase Auth · Postgres · RLS · Edge Functions | `supabase/` |
| 수집 워커 | 공식 회차 수집→검증→UPSERT, 통계 캐시 재계산 | Python | `services/analytics-worker` |

## 2. 경계 규칙 (누가 누구를 부르나)
| 호출자 | 대상 | 방법 | 금지 |
|---|---|---|---|
| `apps/*` 셸 | `packages/ui` · `app-core` | import, 플랫폼 어댑터 구현을 주입 | 셸에 화면 로직·API 호출 작성 |
| `packages/ui` · `app-core` | 네이티브 기능 | 어댑터 인터페이스만 | `@capacitor/*` · `@tauri-apps/*` 직접 import |
| `app-core` | 엔진·통계·검증 | import(동기 호출) | 엔진 호출을 서버로 우회 |
| 엔진·통계 | — | 순수 함수 | 네트워크·저장소·시간·전역 상태 접근(난수는 주입) |
| 클라이언트(3면) | Postgres 사용자 테이블 | Supabase JS + 사용자 JWT, RLS | `service_role` 키 사용·번들 포함 |
| 클라이언트(3면) | 공개 테이블 `draws_*` · `statistics_cache` | Supabase JS + anon, RLS SELECT만 | 회차·통계 테이블 쓰기 |
| 클라이언트(3면) | Edge Function `/v1/*` (판정·관리자·waitlist만) | HTTPS + 사용자 JWT 또는 anon | 공개 읽기를 함수로 우회 |
| Edge Function | Postgres | 함수 내부 서버 키 | 응답에 내부 키·원본 오류 노출 |
| 수집 워커 | 공식 사이트 · Postgres | HTTP 수집, 서버 키로 UPSERT | 검증 실패 데이터 반영 |
| 웹 관리자 (P1) | 검토 플래그·회차 승인 | Edge Function(관리자 권한) | 브라우저에 서버 키 |

- API 계약: [04_API.md](04_API.md) · 테이블·RLS 정책: [05_DATA_MODEL.md](05_DATA_MODEL.md) · 보안 레벨·키: [01_PRD.md#8](01_PRD.md)

## 3. 주요 데이터 흐름
| # | 흐름 | 경로 | 비고 |
|---|---|---|---|
| DF-1 | 번호 생성 | 화면 → `app-core` → 엔진(기기) → 결과 표시 → 로컬 저장 | 네트워크 불필요, 게스트 가능 (D4·D6) |
| DF-2 | 클라우드 동기화 (P1) | 로그인 → 로컬 저장분 → Supabase(RLS, 본인 행만) | 충돌 규칙 팀장 결정 필요 |
| DF-3 | 회차 수집 | 워커 → 공식 결과 수집 → 범위·중복·앞자리 0 검증 → UPSERT(출처·검증 시각) → 통계 캐시 재계산 | 실패 시 발송 중단 + 관리자 검토 플래그 (D7) |
| DF-4 | 결과·통계 조회 | 앱 → Supabase JS(anon) → `draws_*` · `statistics_cache` SELECT(RLS) → 기기 캐시 | Edge Function 미경유. 오프라인이면 마지막 동기화 데이터만 표기 (R6) |
| DF-5 | 당첨 판정 | P0: 앱(등록 번호) → `lottery-core` 판정(기기, DF-4 공개 회차 데이터) → 결과. P1 로그인: Edge Function A-09 → 같은 함수로 서버 판정 → 이력 저장·푸시 | 판정 함수는 하나(기기·서버 공용), 등록 번호만 대상 (R1) |
| DF-6 | 첫 실행 | 만 19세 확인 → 확인 기록(로컬) → 홈 | P0, 미확인 시 진입 불가 |

- 흐름 시퀀스 그림: DF-1 [`diagrams/flow-generate.mmd`](diagrams/flow-generate.mmd) · DF-3 [`diagrams/flow-ingest.mmd`](diagrams/flow-ingest.mmd) · DF-5 [`diagrams/flow-check.mmd`](diagrams/flow-check.mmd)

## 4. 모노레포 구조
```
lotto-lab/                      # pnpm workspaces + Turborepo
├── apps/
│   ├── mobile/                 # Capacitor 8 셸 (탭바)
│   ├── desktop/                # Tauri 2 셸 (사이드바), src-tauri/ 포함
│   └── web/                    # Next.js 랜딩·관리자 (P1)
├── packages/
│   ├── ui/  design-tokens/  app-core/
│   ├── lottery-core/  lotto-engine/  pension-engine/
│   └── statistics/  validation/  types/
├── services/analytics-worker/  # Python
├── supabase/
│   ├── migrations/
│   └── functions/              # Edge Function /v1/*
└── docs/
```
- 의존 방향: `apps` → `ui` → `app-core` → (`lotto-engine`·`pension-engine`·`statistics`·`validation`) → `lottery-core`(엔진·통계만) → `types`. 같은 층끼리·역방향 import 금지(루트 `eslint.config.mjs`가 강제).

## 5. 플랫폼별 네이티브 기능
| 기능 | 모바일 (Capacitor) | Windows (Tauri) | 웹 | 우선순위 |
|---|---|---|---|---|
| 저장·공유 | Clipboard / Share | 클립보드 (공유 시트 없음) | Clipboard API | P0 |
| 로컬 저장(게스트) | 기기 저장소 | 앱 데이터 폴더 | — | P0 |
| 회차 알림 | Local Notifications | 시스템 알림 | — | P1 |
| 구매번호 QR 등록 | Barcode Scanner | 미지원 (웹캠 지원 여부 팀장 결정 필요) | — | P1 |
| 당첨 결과 푸시 | FCM / APNs + 서버 트리거 | 앱 실행 중 로컬 알림만 (서버 푸시 팀장 결정 필요) | — | P1 |
| 오프라인 확인 | 마지막 동기화 데이터 | 동일 | — | P1 |
| 구독 결제 | 스토어 인앱결제 | 미정 (Q3) | — | P2 |
| 자동 업데이트 | 스토어 업데이트 | Tauri updater 플러그인 | 배포 즉시 | P1 (P0은 수동 설치본) |

- 권한(카메라·알림)은 기능 사용 시점에만 요청. 로컬 저장 구현체(키-값 vs SQLite)는 팀장 결정 필요.

## 6. 빌드·배포·자동 업데이트
| 대상 | 빌드 환경 | 산출물 | 배포 경로 | 업데이트 |
|---|---|---|---|---|
| Android | Windows/Linux + Android SDK | AAB | Google Play | 스토어 |
| iOS | macOS + Xcode 필수 | IPA | App Store | 스토어 |
| Windows | Windows (MSVC·WebView2) | MSI / NSIS | 직접 배포 (Q3 기본 가정) | P0: 수동 설치본 재설치. P1: Tauri updater, 서명된 업데이트 매니페스트 확인 후 설치 |
| 웹 (P1) | Node | Next.js 빌드 | 호스팅 미정 — 팀장 결정 필요 | 배포 즉시 |
| 워커 | Python | 스케줄 작업 | 실행 위치·주기 팀장 결정 필요 | 재배포 |
| Supabase | Supabase CLI | 마이그레이션·Edge Function | Supabase 프로젝트 | 마이그레이션 순차 적용 |

- CI 도구·업데이트 매니페스트 호스팅 위치: 팀장 결정 필요. Microsoft Store 경로는 Q3 결정 후.
- WebView2 런타임 배포 방식(부트스트랩 포함 여부)은 착수 시 Tauri 문서 기준으로 확인.

## 7. 코드 서명·키 관리
| 키 | 용도 | 보관 | 비고 |
|---|---|---|---|
| Windows 코드 서명 인증서 (OV/EV) | MSI·NSIS·exe 서명(SmartScreen) | CI 비밀 저장소 / 하드웨어 토큰 | 출시 전 구매 필요 (Q4), 종류·비용 미확인 |
| Tauri updater 서명 키 | 업데이트 패키지 서명·검증 | CI 비밀, 공개키만 앱에 포함 | 분실 시 기존 설치본 자동 업데이트 불가 |
| Android 업로드 키 | Play 업로드 서명 | 오프라인 백업 + CI 비밀 | Play 앱 서명 사용 여부 팀장 결정 필요 |
| Apple 인증서·프로비저닝 | iOS 서명 | macOS 키체인 | 개발자 계정 필요 |
| Supabase `service_role` | Edge Function·워커 서버 키 | 서버 환경 변수만 | 앱 번들·저장소 커밋 금지 (D9) |
| Supabase anon(공개) 키 | 클라이언트 접속 | 앱 번들 허용 | 권한은 RLS가 결정 |

- 보안 레벨 L2 기준·노출 면 위협 메모는 [01_PRD.md#8](01_PRD.md) 정본을 따른다.
