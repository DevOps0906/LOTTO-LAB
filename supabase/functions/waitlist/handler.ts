// A-15 POST /v1/waitlist — 순수 핸들러. 외부 호출(Turnstile·DB)은 deps로 주입한다.
// 순서: 필수 env → 입력 검증 → IP 레이트리밋 → Turnstile → INSERT(충돌 시 동의 갱신) → 202
import { clientIp, normalizeIp } from "./ip.ts";
import type { TurnstileResult } from "./turnstile.ts";

export const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TURNSTILE_SECRET",
  "TURNSTILE_HOSTNAMES",
  "RATE_SALT",
  "ALLOWED_ORIGIN",
] as const;

export const DEFAULT_RATE_WINDOW_SEC = 600;
export const DEFAULT_RATE_MAX = 5;
export const MAX_BODY_BYTES = 4096;
export const BODY_TIMEOUT_MS = 5000;
const MAX_TOKEN_LEN = 2048;
// 로컬부: 공백·@·따옴표·괄호 등 특수문자 제외(점 규칙은 아래에서 따로 검사)
const LOCAL_RE = /^[^\s@"(),:;<>[\\\]]+$/;
// 도메인 라벨: 1~63자, 영숫자 시작·끝, 가운데 하이픈 허용
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i;
const utf8 = new TextEncoder();

export function isValidEmail(email: string): boolean {
  if (utf8.encode(email).length > 254) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (utf8.encode(local).length > 64 || !LOCAL_RE.test(local)) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l))) return false;
  return TLD_RE.test(labels[labels.length - 1]);
}

export interface Config {
  supabaseUrl: string;
  serviceRoleKey: string;
  turnstileSecret: string;
  turnstileHostnames: string[];
  rateSalt: string;
  allowedOrigin: string;
  rateWindowSec: number;
  rateMax: number;
}

export interface Deps {
  env: Record<string, string | undefined>;
  verifyTurnstile(cfg: Config, token: string, remoteIp: string | null): Promise<TurnstileResult>;
  rateHit(cfg: Config, key: string, windowSec: number, max: number): Promise<boolean>;
  insert(cfg: Config, email: string): Promise<void>;
  bodyTimeoutMs?: number; // 테스트용. 기본 BODY_TIMEOUT_MS
}

const MESSAGES: Record<string, string> = {
  INVALID_INPUT: "입력값을 확인해 주세요.",
  RATE_LIMITED: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  SERVICE_UNAVAILABLE: "일시적인 오류입니다. 잠시 후 다시 시도해 주세요.",
  METHOD_NOT_ALLOWED: "허용되지 않은 요청입니다.",
  INTERNAL: "서버 설정 오류입니다.",
};

function positiveInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function loadConfig(env: Record<string, string | undefined>): Config | null {
  if (REQUIRED_ENV.some((k) => !env[k]?.trim())) return null;
  const hostnames = env.TURNSTILE_HOSTNAMES!.split(",").map((s) => s.trim()).filter(Boolean);
  if (hostnames.length === 0) return null;
  return {
    supabaseUrl: env.SUPABASE_URL!.replace(/\/+$/, ""),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
    turnstileSecret: env.TURNSTILE_SECRET!,
    turnstileHostnames: hostnames,
    rateSalt: env.RATE_SALT!,
    allowedOrigin: env.ALLOWED_ORIGIN!.trim(),
    rateWindowSec: positiveInt(env.WAITLIST_RATE_WINDOW_SEC, DEFAULT_RATE_WINDOW_SEC),
    rateMax: positiveInt(env.WAITLIST_RATE_MAX, DEFAULT_RATE_MAX),
  };
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  if (!origin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

function error(status: number, code: string, cors: Record<string, string>, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: { code, message: MESSAGES[code] } }), {
    status,
    headers: { ...cors, ...extra, "content-type": "application/json; charset=utf-8" },
  });
}

// 로그에는 사유 코드만 남긴다(이메일·IP·토큰 원문 금지).
function logReason(reason: string) {
  console.warn(JSON.stringify({ fn: "waitlist", reason }));
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Input {
  email: string;
  token: string;
}

type BodyFailure = "body_too_large" | "body_timeout" | "invalid_input";

// 본문을 바이트 기준 MAX_BODY_BYTES까지만, timeoutMs 안에 읽는다. 초과·지연 즉시 중단.
async function readBody(req: Request, timeoutMs: number): Promise<string | BodyFailure> {
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return "body_too_large";
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((r) => {
    timer = setTimeout(() => r("timeout"), timeoutMs);
  });
  try {
    while (true) {
      const next = await Promise.race([reader.read(), timeout]);
      if (next === "timeout") {
        reader.cancel().catch(() => {});
        return "body_timeout";
      }
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_BODY_BYTES) {
        reader.cancel().catch(() => {});
        return "body_too_large";
      }
      chunks.push(next.value);
    }
  } catch {
    return "invalid_input";
  } finally {
    clearTimeout(timer);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return "invalid_input";
  }
}

function parseInput(raw: string): Input | null {
  let b: unknown;
  try {
    b = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof b !== "object" || b === null || Array.isArray(b)) return null;
  const o = b as Record<string, unknown>;
  if (typeof o.email !== "string" || typeof o.turnstile_token !== "string") return null;
  const email = o.email.trim();
  if (!isValidEmail(email)) return null;
  if (o.consent_marketing !== true || o.age_confirmed !== true) return null;
  const token = o.turnstile_token;
  if (token.length === 0 || token.length > MAX_TOKEN_LEN) return null;
  return { email, token };
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

    // 본문 초과·수신 지연도 기존 코드 재사용(400 INVALID_INPUT), 사유는 로그로만 구분
    const raw = await readBody(req, deps.bodyTimeoutMs ?? BODY_TIMEOUT_MS);
    const failed = raw === "body_too_large" || raw === "body_timeout" || raw === "invalid_input";
    const input = failed ? null : parseInput(raw);
    if (!input) {
      logReason(failed ? raw : "invalid_input");
      return error(400, "INVALID_INPUT", cors);
    }

    const rawIp = clientIp(req.headers);
    const ip = normalizeIp(rawIp);
    // IP를 못 구하면 공통 키("unknown")로 묶어 제한한다(원문은 남기지 않음).
    if (!ip) logReason("ip_unknown");
    const key = await sha256Hex(cfg.rateSalt + (ip ?? "unknown"));
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

    const ts = await deps.verifyTurnstile(cfg, input.token, ip && !ip.endsWith("/64") ? ip : rawIp);
    if (ts === "unavailable") {
      logReason("turnstile_unavailable");
      return error(503, "SERVICE_UNAVAILABLE", cors);
    }
    if (ts !== "ok") {
      logReason("turnstile_rejected");
      return error(400, "INVALID_INPUT", cors);
    }

    try {
      await deps.insert(cfg, input.email);
    } catch {
      logReason("insert_failed");
      return error(503, "SERVICE_UNAVAILABLE", cors);
    }
    return new Response(null, { status: 202, headers: cors });
  };
}
