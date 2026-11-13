// A-19 POST /v1/waitlist-confirm — 순수 핸들러. 외부 호출(DB)은 deps로 주입한다.
// 순서: 필수 env → 입력 검증 → IP 레이트리밋(키 `confirm:` 접두, A-15와 분리) → RPC waitlist_confirm
// 200 = 확정(이미 확정된 같은 토큰도 200) · 400 = 없음·만료·형식 오류 구분 없이 동일 · 429 · 503
import {
  BODY_TIMEOUT_MS,
  corsHeaders,
  DEFAULT_RATE_MAX,
  DEFAULT_RATE_WINDOW_SEC,
  error,
  ipRateKey,
  isBodyFailure,
  logReason as log,
  parseObject,
  positiveInt,
  readBody,
  sha256Hex,
} from "../_shared/http.ts";

export const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RATE_SALT", "ALLOWED_ORIGIN"] as const;
export const RATE_KEY_PREFIX = "confirm:";
// A-15가 만드는 토큰: 32바이트 base64url(패딩 없음) = 43자
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export interface Config {
  supabaseUrl: string;
  serviceRoleKey: string;
  rateSalt: string;
  allowedOrigin: string;
  rateWindowSec: number;
  rateMax: number;
}

export interface Deps {
  env: Record<string, string | undefined>;
  rateHit(cfg: Config, key: string, windowSec: number, max: number): Promise<boolean>;
  confirm(cfg: Config, tokenHash: string): Promise<boolean>;
  bodyTimeoutMs?: number; // 테스트용. 기본 BODY_TIMEOUT_MS
}

// 레이트리밋 한도는 A-15와 같은 env를 쓰되 키는 분리된다.
export function loadConfig(env: Record<string, string | undefined>): Config | null {
  if (REQUIRED_ENV.some((k) => !env[k]?.trim())) return null;
  return {
    supabaseUrl: env.SUPABASE_URL!.replace(/\/+$/, ""),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
    rateSalt: env.RATE_SALT!,
    allowedOrigin: env.ALLOWED_ORIGIN!.trim(),
    rateWindowSec: positiveInt(env.WAITLIST_RATE_WINDOW_SEC, DEFAULT_RATE_WINDOW_SEC),
    rateMax: positiveInt(env.WAITLIST_RATE_MAX, DEFAULT_RATE_MAX),
  };
}

const logReason = (reason: string) => log("waitlist-confirm", reason);

function parseToken(raw: string): string | null {
  const o = parseObject(raw);
  return o && typeof o.token === "string" && TOKEN_RE.test(o.token) ? o.token : null;
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  return async (req) => {
    const cors = corsHeaders(deps.env.ALLOWED_ORIGIN?.trim());
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return error(405, "METHOD_NOT_ALLOWED", cors, { allow: "POST, OPTIONS" });

    const cfg = loadConfig(deps.env);
    if (!cfg) {
      logReason("missing_env");
      return error(500, "INTERNAL", cors);
    }

    const raw = await readBody(req, deps.bodyTimeoutMs ?? BODY_TIMEOUT_MS);
    const token = isBodyFailure(raw) ? null : parseToken(raw);
    if (!token) {
      logReason(isBodyFailure(raw) ? raw : "invalid_input");
      return error(400, "INVALID_INPUT", cors);
    }

    const { key, unknown } = await ipRateKey(req.headers, cfg.rateSalt, RATE_KEY_PREFIX);
    if (unknown) logReason("ip_unknown");
    let allowed: boolean;
    try {
      allowed = await deps.rateHit(cfg, key, cfg.rateWindowSec, cfg.rateMax);
    } catch {
      logReason("rate_hit_failed");
      return error(503, "SERVICE_UNAVAILABLE", cors);
    }
    if (!allowed) {
      logReason("rate_limited");
      return error(429, "RATE_LIMITED", cors, { "retry-after": String(cfg.rateWindowSec) });
    }

    let ok: boolean;
    try {
      ok = await deps.confirm(cfg, await sha256Hex(token));
    } catch {
      logReason("confirm_failed");
      return error(503, "SERVICE_UNAVAILABLE", cors);
    }
    if (!ok) {
      logReason("token_rejected");
      return error(400, "INVALID_INPUT", cors);
    }
    return new Response(null, { status: 200, headers: cors });
  };
}
