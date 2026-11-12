import path from "node:path";
import type { NextConfig } from "next";

// 보안 헤더. CSP는 요청별 nonce가 필요해 src/proxy.ts에서 붙인다.
const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS는 운영(HTTPS)에서만. 개발 서버(localhost http)에는 붙이지 않는다.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // 공용 디자인 토큰(packages/design-tokens)을 상대 경로로 가져오기 위해 저장소 루트를 기준으로 삼는다.
  turbopack: { root: path.join(import.meta.dirname, "../..") },
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  async headers() {
    return [
      { source: "/:path*", headers: common },
      // 확인 링크 화면은 리퍼러를 아예 보내지 않는다(뒤에 오는 규칙이 덮어쓴다).
      { source: "/waitlist/confirm", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;
