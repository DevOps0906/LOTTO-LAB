import Link from "next/link";

// 자체 워드마크만 쓴다(공식 복권 로고·상호 모방 금지).
export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface text-text">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-page py-3">
        <Link href="/" className="rounded-control text-h2 font-extrabold tracking-tight text-primary">
          LOTTO LAB
        </Link>
        <span className="text-caption text-text-muted">만 19세 이상 · 비공식 기록 도구</span>
      </div>
    </header>
  );
}
