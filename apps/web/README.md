# apps/web — LOTTO LAB 웹 랜딩 (W-01 · W-05)

사전알림 랜딩(`/`)과 사전알림 이메일 확인 화면(`/waitlist/confirm#token=…`). 관리자 화면은 아직 없음(task-032·033).

## 진행 현황
- [x] W-01 랜딩: 히어로 · 고지(만 19세 이상 · 판매/구매대행 없음 · 미래 예측 아님) · 기능 카드 3 · 사전알림 폼 · FAQ · 푸터
- [x] 사전알림 폼 → A-15 (Turnstile, 202·400·429·503 상태, 중복 제출 잠금)
- [x] W-05 확인 화면 → A-19 (버튼 클릭 시에만 POST, 토큰은 URL fragment에서 읽고 즉시 제거)
- [ ] 약관 · 개인정보처리방침 · 운영 주체 · 문의 (확정 전, 푸터에 "준비 중")
- [ ] 실제 설치 링크(배포 전에는 "준비 중" 모달)

## 버전 (2026-11-12 `npm view` 기준 최신 stable, 정확한 버전 고정)
| 패키지 | 버전 |
|---|---|
| Next.js | 16.4.6 |
| React · React DOM | 19.3.1 |
| Tailwind CSS · @tailwindcss/postcss | 4.3.5 |
| TypeScript | 7.0.2 |
| Vitest · Vite · jsdom | 5.1.0 · 8.3.8 · 31.0.0 |
| Testing Library (react · user-event · jest-dom) | 16.3.3 · 14.6.10 · 7.0.1 |

## 명령 (모노레포 구성 전까지 이 폴더 단독, task-005에서 workspace로 이전)
| 목적 | 명령 |
|---|---|
| 설치 | `pnpm --dir apps/web install --ignore-workspace` |
| 개발 서버 | `pnpm --dir apps/web dev` |
| 빌드 · 타입 · 테스트 | `pnpm --dir apps/web build` · `typecheck` · `test` |

## 환경 변수 (`.env.example`이 정본, 값은 커밋 금지)
| 이름 | 용도 |
|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile 사이트 키(공개). 개발 모드에서 비우면 Cloudflare 공개 테스트 키 사용 |
| `NEXT_PUBLIC_WAITLIST_API_URL` | A-15 EF URL (`/functions/v1/waitlist`) |
| `NEXT_PUBLIC_WAITLIST_CONFIRM_URL` | A-19 EF URL (`/functions/v1/waitlist-confirm`) |

## 보안
- 디자인 토큰은 `packages/design-tokens/tokens.css`를 `src/app/globals.css`에서 상대 경로로 import(복사 없음).
- CSP는 요청별 nonce가 필요해 `src/proxy.ts`에서 붙인다: `script-src 'self' 'nonce-…' https://challenges.cloudflare.com`, `frame-src` Turnstile, `connect-src`는 위 두 EF의 origin, `frame-ancestors 'none'`.
- `style-src`에는 `'unsafe-inline'`을 둔다: Next.js(next/script·라우터)와 Tailwind/React `style` 속성이 인라인 스타일을 쓰기 때문이다. 스크립트는 nonce로만 실행되므로 인라인 스크립트 주입은 계속 차단된다.
- 나머지 헤더는 `next.config.ts`: `Referrer-Policy: strict-origin-when-cross-origin`(확인 화면은 `no-referrer` + meta), `X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`(운영 빌드만).
- 모든 페이지가 요청 시 렌더링이다(`layout.tsx`의 `await connection()`) — nonce를 Next.js 인라인 스크립트에 붙이기 위해서다.

## 라이선스 (2026-11-12 확인)
- `secscan license apps/web`: lockfile(pnpm)에 라이선스 필드가 없어 218개 모두 "정보 없음" — 자동 판정 불가.
- 수동 확인(`pnpm licenses list`): GPL·AGPL 없음. MIT·Apache-2.0·ISC·BSD·0BSD·BlueOak 외 예외는 아래뿐이며 허용으로 판단했다.
  - `@img/sharp-win32-x64`(Apache-2.0 AND LGPL-3.0-or-later, libvips): next의 선택(optional) 의존성, 동적 링크 바이너리. 이 앱은 이미지 최적화를 쓰지 않는다.
  - `lightningcss`(MPL-2.0): Tailwind 빌드 전용, 수정·재배포하지 않음.
  - `caniuse-lite`(CC-BY-4.0): 브라우저 지원 데이터.
- 확인 토큰은 fragment(`#token=`)라 서버 로그·리퍼러에 실리지 않고, 화면에 표시하지 않으며 읽은 즉시 주소창에서 지운다.
