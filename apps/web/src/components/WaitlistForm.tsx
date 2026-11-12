"use client";

import { useRef, useState, type FormEvent } from "react";
import { postJson, retryText } from "@/lib/api";
import { turnstileSiteKey, waitlistApiUrl } from "@/lib/config";
import { Turnstile, type TurnstileHandle } from "./Turnstile";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "submitting" | "success";

// W-01 사전알림 신청 폼 → A-15 POST. 202는 중복 이메일도 같은 응답이라 가입 여부를 구분하지 않는다.
export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [age, setAge] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const lock = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const ready = email.trim() !== "" && consent && age && token !== null;
  const submitting = status === "submitting";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready || lock.current) return;
    setEmailError(null);
    setFormError(null);
    const value = email.trim();
    if (!EMAIL_RE.test(value) || value.length > 254) {
      setEmailError("이메일 주소 형식을 확인해 주세요.");
      emailRef.current?.focus();
      return;
    }
    lock.current = true;
    setStatus("submitting");
    const result = await postJson(
      waitlistApiUrl,
      { email: value, consent_marketing: true, age_confirmed: true, turnstile_token: token },
      202,
    );
    lock.current = false;
    if (result.kind === "ok") {
      setStatus("success");
      return;
    }
    setStatus("idle");
    // Turnstile 토큰은 1회용 — 실패하면 새로 받는다(입력값은 그대로 둔다).
    turnstile.current?.reset();
    if (result.kind === "invalid") {
      setEmailError("이메일 주소를 확인한 뒤 보안 확인을 다시 하고 신청해 주세요.");
      emailRef.current?.focus();
    } else if (result.kind === "rate_limited") {
      setFormError(retryText(result.retryAfterSec));
    } else {
      setFormError("일시적으로 신청을 받을 수 없어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  if (status === "success") {
    return (
      <div role="status" className="rounded-card bg-primary-soft p-6 text-primary-soft-fg">
        <p className="text-h2 font-bold">확인 메일을 보냈어요 — 메일의 링크로 신청을 확정해 주세요</p>
        <p className="mt-2 text-caption">
          메일이 보이지 않으면 스팸함을 확인해 주세요. 링크에서 확정하기 전에는 신청이 완료되지 않아요.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-describedby="waitlist-hint">
      <div>
        <label htmlFor="waitlist-email" className="block font-bold">
          이메일 <span aria-hidden="true">*</span>
        </label>
        <input
          ref={emailRef}
          id="waitlist-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "waitlist-email-error" : undefined}
          className="mt-1 h-control w-full rounded-control border border-input bg-surface px-4 text-text"
          placeholder="you@example.com"
        />
        {emailError && (
          <p id="waitlist-email-error" role="alert" className="mt-1 text-caption text-danger">
            {emailError}
          </p>
        )}
      </div>

      <label className="flex min-h-control cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="size-5 shrink-0 accent-primary"
        />
        <span>
          <span aria-hidden="true">* </span>출시 알림 메일 수신에 동의해요(필수)
        </span>
      </label>
      <label className="flex min-h-control cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={age}
          onChange={(e) => setAge(e.target.checked)}
          className="size-5 shrink-0 accent-primary"
        />
        <span>
          <span aria-hidden="true">* </span>만 19세 이상이에요(필수)
        </span>
      </label>

      {turnstileSiteKey ? (
        <Turnstile ref={turnstile} siteKey={turnstileSiteKey} onToken={setToken} />
      ) : (
        <p className="text-caption text-text-muted">보안 확인 설정이 준비 중이라 지금은 신청할 수 없어요.</p>
      )}

      <p id="waitlist-hint" className="text-caption text-text-muted">
        수집 항목: 이메일 · 목적: 출시 알림 1회 발송 · 보관: 발송 후 파기(발송 전이라도 최대 6개월 뒤 파기).
        {!ready && " 이메일 입력, 두 항목 확인, 보안 확인을 마치면 신청할 수 있어요."}
      </p>

      {formError && (
        <p role="alert" className="rounded-control bg-bg p-3 text-caption text-danger">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={!ready || submitting}
        aria-busy={submitting || undefined}
        className="cta-primary h-control w-full rounded-control font-bold disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:px-8"
      >
        {submitting ? "신청 중…" : "사전알림 신청"}
      </button>
    </form>
  );
}
