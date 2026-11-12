// A-20 POST /v1/account-delete — 순수 핸들러. 외부 호출(Auth·DB)은 deps로 주입한다.
// 순서: 필수 env → Bearer JWT 형식 → Auth로 사용자 확인(401) → 최근 재인증(403) → 사용자 레이트리밋(키 `delete:` 접두) → 본인 삭제
// 삭제 대상은 JWT의 사용자뿐이다(본문은 읽지 않는다 — 다른 user_id 지정 불가).
// 200 = 삭제 완료(이미 삭제된 사용자의 유효 토큰도 200, 멱등) · 401 · 403 REAUTH_REQUIRED · 429 · 503
import {
  corsHeaders,
  DEFAULT_RATE_MAX,
  DEFAULT_RATE_WINDOW_SEC,
  error,
  logReason as log,
  sha256Hex,
} from "../_shared/http.ts";
import type { AuthUser } from "./auth.ts";

export const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RATE_SALT", "ALLOWED_ORIGIN"] as const;
export const RATE_KEY_PREFIX = "delete:";
const BEARER_RE = /^bearer +([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
// 최근 재인증: 액세스 토큰 amr의 password·otp 인증 시각이 이 안이어야 삭제한다(앱은 삭제 직전 비밀번호 재입력).
export const REAUTH_MAX_AGE_SEC = 600;
const REAUTH_METHODS = new Set(["password", "otp"]);

export interface Config {
  supabaseUrl: string;
  serviceRoleKey: string;
  rateSalt: string;
  allowedOrigin: string;
}

export interface Deps {
  env: Record<string, string | undefined>;
  getUser(cfg: Config, jwt: string): Promise<AuthUser>;
  rateHit(cfg: Config, key: string, windowSec: number, max: number): Promise<boolean>;
  deleteUser(cfg: Config, id: string): Promise<void>;
  nowSec?: () => number; // 테스트용. 기본 현재 시각(초)
}

// 서명·만료는 getUser(GoTrue)가 이미 확인했다. 여기서는 payload의 amr만 읽는다.
export function recentAuth(jwt: string, nowSec: number): boolean {
  let payload: unknown;
  try {
    const b64 = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  } catch {
    return false;
  }
  const amr = (payload as { amr?: unknown } | null)?.amr;
  if (!Array.isArray(amr)) return false;
  return amr.some((e) => {
    const m = e as { method?: unknown; timestamp?: unknown } | null;
    return typeof m?.method === "string" && REAUTH_METHODS.has(m.method) && typeof m.timestamp === "number" &&
      m.timestamp <= nowSec + 60 && nowSec - m.timestamp <= REAUTH_MAX_AGE_SEC;
  });
}

// 단일 origin만 허용(와일드카드 "*"·빈 값은 설정 오류).
function validOrigin(v: string | undefined): string | undefined {
  const o = v?.trim();
  return o && o !== "*" ? o : undefined;
}

export function loadConfig(env: Record<string, string | undefined>): Config | null {
  if (REQUIRED_ENV.some((k) => !env[k]?.trim()) || !validOrigin(env.ALLOWED_ORIGIN)) return null;
  return {
    supabaseUrl: env.SUPABASE_URL!.replace(/\/+$/, ""),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
    rateSalt: env.RATE_SALT!,
    allowedOrigin: env.ALLOWED_ORIGIN!.trim(),
  };
}

const logReason = (reason: string) => log("account-delete", reason);

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  return async (req) => {
    const cors = corsHeaders(validOrigin(deps.env.ALLOWED_ORIGIN));
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return error(405, "METHOD_NOT_ALLOWED", cors, { allow: "POST, OPTIONS" });

    const cfg = loadConfig(deps.env);
    if (!cfg) {
      logReason("missing_env");
      return error(500, "INTERNAL", cors);
    }

    const jwt = BEARER_RE.exec(req.headers.get("authorization")?.trim() ?? "")?.[1];
    if (!jwt) {
      logReason("no_jwt");
      return error(401, "UNAUTHENTICATED", cors);
    }

    let user: AuthUser;
    try {
      user = await deps.getUser(cfg, jwt);
    } catch {
      logReason("get_user_failed");
      return error(503, "SERVICE_UNAVAILABLE", cors);
    }
    if (user.kind === "invalid") {
      logReason("jwt_rejected");
      return error(401, "UNAUTHENTICATED", cors);
    }
    if (user.kind === "gone") {
      logReason("already_deleted");
      return new Response(null, { status: 200, headers: cors });
    }
    if (!recentAuth(jwt, deps.nowSec?.() ?? Math.floor(Date.now() / 1000))) {
      logReason("reauth_required");
      return error(403, "REAUTH_REQUIRED", cors);
    }

    const key = RATE_KEY_PREFIX + await sha256Hex(cfg.rateSalt + user.id);
    let allowed: boolean;
    try {
      allowed = await deps.rateHit(cfg, key, DEFAULT_RATE_WINDOW_SEC, DEFAULT_RATE_MAX);
    } catch {
      logReason("rate_hit_failed");
      return error(503, "SERVICE_UNAVAILABLE", cors);
    }
    if (!allowed) {
      logReason("rate_limited");
      return error(429, "RATE_LIMITED", cors, { "retry-after": String(DEFAULT_RATE_WINDOW_SEC) });
    }

    try {
      await deps.deleteUser(cfg, user.id);
    } catch {
      logReason("delete_failed");
      return error(503, "SERVICE_UNAVAILABLE", cors);
    }
    return new Response(null, { status: 200, headers: cors });
  };
}
