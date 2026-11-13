import { NextResponse, type NextRequest } from "next/server";

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

function originOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

// 요청마다 nonce를 만들어 CSP에 넣는다. Next.js가 헤더의 nonce를 읽어 자체 인라인 스크립트에 붙인다.
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const apiOrigins = [
    originOf(process.env.NEXT_PUBLIC_WAITLIST_API_URL),
    originOf(process.env.NEXT_PUBLIC_WAITLIST_CONFIRM_URL),
  ].filter((o, i, all) => o && all.indexOf(o) === i);

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${TURNSTILE_ORIGIN}${dev ? " 'unsafe-eval'" : ""}`,
    // 'unsafe-inline'은 스타일에만 허용: Next.js(next/script·라우터)와 Tailwind/React style 속성이 인라인 스타일을 쓴다.
    // 스크립트는 nonce로만 실행되므로 인라인 스크립트 주입은 여전히 차단된다.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${TURNSTILE_ORIGIN} ${apiOrigins.join(" ")}${dev ? " ws:" : ""}`.trim(),
    `frame-src ${TURNSTILE_ORIGIN}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
