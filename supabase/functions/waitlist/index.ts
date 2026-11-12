// A-15 사전알림 Edge Function 진입점 — 실제 의존성을 주입한다. 로직은 handler.ts.
import { createHandler } from "./handler.ts";
import { insertSignup, rateHit } from "./rest.ts";
import { verifyTurnstile } from "./turnstile.ts";

const handler = createHandler({
  env: Deno.env.toObject(),
  verifyTurnstile: (cfg, token, remoteIp) =>
    verifyTurnstile({ secret: cfg.turnstileSecret, hostnames: cfg.turnstileHostnames, token, remoteIp }),
  rateHit: (cfg, key, windowSec, max) => rateHit(cfg, key, windowSec, max),
  insert: (cfg, email) => insertSignup(cfg, email),
});

Deno.serve(handler);
