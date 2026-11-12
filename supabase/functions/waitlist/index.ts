// A-15 사전알림 Edge Function 진입점 — 실제 의존성을 주입한다. 로직은 handler.ts.
import { rateHit, requestConfirm } from "../_shared/rest.ts";
import { sendMail } from "../_shared/mailer.ts";
import { createHandler } from "./handler.ts";
import { verifyTurnstile } from "./turnstile.ts";

// Supabase Edge Runtime 전역: 응답 뒤에도 작업(메일 발송)을 끝까지 실행한다.
// 시작 시 지원 여부를 확인하고, 없으면 waitUntil을 넘기지 않아 핸들러가 DB 접근 전 500으로 막는다.
const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
const waitUntil = typeof edgeRuntime?.waitUntil === "function"
  ? (p: Promise<unknown>) => edgeRuntime.waitUntil!(p)
  : undefined;
if (!waitUntil) console.error(JSON.stringify({ fn: "waitlist", reason: "wait_until_unsupported" }));

const handler = createHandler({
  env: Deno.env.toObject(),
  verifyTurnstile: (cfg, token, remoteIp) =>
    verifyTurnstile({ secret: cfg.turnstileSecret, hostnames: cfg.turnstileHostnames, token, remoteIp }),
  rateHit: (cfg, key, windowSec, max) => rateHit(cfg, key, windowSec, max),
  requestConfirm: (cfg, email, tokenHash, o) => requestConfirm(cfg, email, tokenHash, o),
  sendMail: (cfg, msg) => sendMail(cfg, msg),
  waitUntil,
});

Deno.serve(handler);
