"use client";

import Script from "next/script";
import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileHandle = { reset: () => void };

type Props = {
  siteKey: string;
  onToken: (token: string | null) => void;
  ref?: Ref<TurnstileHandle>;
};

// Cloudflare Turnstile(명시적 렌더). 토큰은 1회용이라 제출 실패 뒤 reset 한다.
export function Turnstile({ siteKey, onToken, ref }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const tokenCb = useRef(onToken);
  tokenCb.current = onToken;

  const render = useCallback(() => {
    if (!window.turnstile || !box.current || widgetId.current) return;
    widgetId.current = window.turnstile.render(box.current, {
      sitekey: siteKey,
      language: "ko",
      callback: (t: string) => tokenCb.current(t),
      "expired-callback": () => tokenCb.current(null),
      "error-callback": () => tokenCb.current(null),
    });
  }, [siteKey]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      tokenCb.current(null);
      if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
    },
  }));

  useEffect(() => {
    render();
    return () => {
      if (window.turnstile && widgetId.current) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [render]);

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render} />
      <div ref={box} aria-label="보안 확인" />
    </>
  );
}
