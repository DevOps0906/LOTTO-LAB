// A-19 사전알림 이메일 확인 Edge Function 진입점 — 실제 의존성을 주입한다. 로직은 handler.ts.
import { confirmToken, rateHit } from "../_shared/rest.ts";
import { createHandler } from "./handler.ts";

const handler = createHandler({
  env: Deno.env.toObject(),
  rateHit: (cfg, key, windowSec, max) => rateHit(cfg, key, windowSec, max),
  confirm: (cfg, tokenHash) => confirmToken(cfg, tokenHash),
});

Deno.serve(handler);
