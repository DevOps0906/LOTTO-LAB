// A-20 계정 삭제 Edge Function 진입점 — 실제 의존성을 주입한다. 로직은 handler.ts.
import { rateHit } from "../_shared/rest.ts";
import { deleteUser, getUser } from "./auth.ts";
import { createHandler } from "./handler.ts";

const handler = createHandler({
  env: Deno.env.toObject(),
  getUser: (cfg, jwt) => getUser(cfg, jwt),
  rateHit: (cfg, key, windowSec, max) => rateHit(cfg, key, windowSec, max),
  deleteUser: (cfg, id) => deleteUser(cfg, id),
});

Deno.serve(handler);
