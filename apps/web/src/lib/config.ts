// 공개(NEXT_PUBLIC_*) 설정만 둔다. 비밀은 이 앱에 넣지 않는다.
// Cloudflare 공개 테스트 사이트 키(항상 통과) — 개발 모드에서 값이 없을 때만 쓴다.
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

export const turnstileSiteKey =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
  (process.env.NODE_ENV === "production" ? "" : TURNSTILE_TEST_SITE_KEY);

export const waitlistApiUrl = process.env.NEXT_PUBLIC_WAITLIST_API_URL ?? "";
export const waitlistConfirmUrl = process.env.NEXT_PUBLIC_WAITLIST_CONFIRM_URL ?? "";
