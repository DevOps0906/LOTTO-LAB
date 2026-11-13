import type { Metadata } from "next";
import { ConfirmPanel } from "@/components/ConfirmPanel";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

// 확인 링크 화면: 검색 노출·리퍼러 전송 없음(next.config 헤더와 함께 이중으로 막는다).
export const metadata: Metadata = {
  title: "사전알림 신청 확정 — LOTTO LAB",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function WaitlistConfirmPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-page">
        <section className="mt-8 rounded-card border border-border bg-surface p-6 shadow-card md:p-8">
          <ConfirmPanel />
          <p className="mt-6 border-t border-border pt-4 text-caption text-text-muted">
            만 19세 이상만 신청할 수 있어요. 출시 알림 메일의 수신 거부 안내 또는 문의처로 언제든 신청 삭제를 요청할 수
            있고, 알림을 보낸 뒤에는 이메일 주소를 파기해요.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
