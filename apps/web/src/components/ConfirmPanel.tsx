"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { postJson, retryText } from "@/lib/api";
import { waitlistConfirmUrl } from "@/lib/config";

type Status = "loading" | "no_token" | "idle" | "submitting" | "done" | "invalid" | "error";

// W-05: 확인 링크 /waitlist/confirm#token=… — 토큰은 fragment라 서버 요청·리퍼러에 실리지 않는다.
// 읽은 즉시 주소창에서 지우고, 버튼을 눌렀을 때만 A-19 POST(메일 보안 스캐너 자동 확정 방지).
export function ConfirmPanel() {
  const token = useRef<string | null>(null);
  const lock = useRef(false);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // 개발 모드 StrictMode의 이중 실행 때 이미 지운 해시를 다시 읽지 않도록 한 번만 처리한다.
    if (token.current) return;
    const t = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    token.current = t || null;
    setStatus(t ? "idle" : "no_token");
  }, []);

  async function confirm() {
    if (!token.current || lock.current) return;
    lock.current = true;
    setStatus("submitting");
    setMessage(null);
    const result = await postJson(waitlistConfirmUrl, { token: token.current }, 200);
    lock.current = false;
    if (result.kind === "ok") {
      token.current = null;
      setStatus("done");
    } else if (result.kind === "invalid") {
      token.current = null;
      setStatus("invalid");
    } else {
      setStatus("error");
      setMessage(
        result.kind === "rate_limited"
          ? retryText(result.retryAfterSec)
          : "일시적으로 확정할 수 없어요. 잠시 후 다시 시도해 주세요.",
      );
    }
  }

  const back = (
    <Link href="/#waitlist" className="font-bold text-primary-soft-fg underline underline-offset-4">
      랜딩에서 다시 신청하기
    </Link>
  );

  if (status === "loading") {
    return <p className="text-text-muted">확인 링크를 읽고 있어요…</p>;
  }
  if (status === "no_token") {
    return (
      <div className="space-y-3">
        <h1 className="text-h1 font-extrabold">확인 링크를 찾을 수 없어요</h1>
        <p className="text-text-muted">
          받은 메일의 링크를 다시 눌러 주세요. 메일이 없거나 오래되었다면 다시 신청해 새 확인 메일을 받아 주세요.
        </p>
        {back}
      </div>
    );
  }
  if (status === "done") {
    return (
      <div role="status" className="space-y-3">
        <h1 className="text-h1 font-extrabold">사전알림 신청이 확정되었어요</h1>
        <p className="text-text-muted">출시 때 알림 메일을 한 번 보내 드리고, 보낸 뒤에는 이메일 주소를 파기해요.</p>
        <Link href="/" className="font-bold text-primary-soft-fg underline underline-offset-4">
          랜딩으로 돌아가기
        </Link>
      </div>
    );
  }
  if (status === "invalid") {
    return (
      <div role="alert" className="space-y-3">
        <h1 className="text-h1 font-extrabold">링크가 만료되었거나 올바르지 않아요 — 다시 신청해 주세요</h1>
        <p className="text-text-muted">랜딩에서 다시 신청하면 새 확인 메일을 보내 드려요.</p>
        {back}
      </div>
    );
  }

  const submitting = status === "submitting";
  return (
    <div className="space-y-4">
      <h1 className="text-h1 font-extrabold">사전알림 신청을 확정할까요?</h1>
      <p className="text-text-muted">
        이 링크를 받은 이메일 주소로 LOTTO LAB 출시 알림을 한 번 받게 돼요. 아래 버튼을 눌러야 신청이 확정돼요.
      </p>
      {message && (
        <p role="alert" className="rounded-control bg-bg p-3 text-caption text-danger">
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={confirm}
        disabled={submitting}
        aria-busy={submitting || undefined}
        className="cta-primary h-control w-full rounded-control font-bold disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:px-8"
      >
        {submitting ? "확정 중…" : "신청 확정하기"}
      </button>
      <p>
        <Link href="/" className="font-bold text-primary-soft-fg underline underline-offset-4">
          랜딩으로
        </Link>
      </p>
    </div>
  );
}
