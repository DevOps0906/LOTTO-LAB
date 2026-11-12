import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "LOTTO LAB — 데이터로 살펴보는 로또·연금 번호 기록",
  description:
    "로또 6/45·연금복권 720+ 번호 생성, 과거 회차 통계, 내 번호 기록을 한곳에서. 만 19세 이상 대상, 복권 판매·구매 대행 없음.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// CSP nonce(src/proxy.ts)를 Next.js 인라인 스크립트에 붙이려면 요청 시 렌더링이어야 한다.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
