// A-15 POST /v1/waitlist — 순수 핸들러. 외부 호출(Turnstile·DB·메일)은 deps로 주입한다.
// 순서: 필수 env → 입력 검증 → IP 레이트리밋 → Turnstile → RPC waitlist_request_confirm → 202
// 응답은 확인 여부·이메일별 한도·발송 결과와 무관하게 항상 같은 202. 메일은 응답 뒤 waitUntil로 보낸다.
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
import { confirmMail, loadMailConfig, type MailConfig, type MailMessage } from "../_shared/mailer.ts";
import type { TurnstileResult } from "./turnstile.ts";

export const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TURNSTILE_SECRET",
  "TURNSTILE_HOSTNAMES",
  "RATE_SALT",
  "ALLOWED_ORIGIN",
] as const;

// 확인 메일: 토큰 24시간 유효, 이메일별 24시간 3통(제3자 메일 폭탄 방지)
export const CONFIRM_TTL_SEC = 86400;
export const CONFIRM_MAX_SENDS = 3;
export const CONFIRM_WINDOW_SEC = 86400;
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

export interface Config extends MailConfig {
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
  // true = 확인 메일을 보낼 것(신규·미확인·한도 이내)
  requestConfirm(
    cfg: Config,
    email: string,
    tokenHash: string,
    o: { ttlSec: number; maxSends: number; windowSec: number },
  ): Promise<boolean>;
  sendMail(cfg: Config, msg: MailMessage): Promise<void>;
  // 운영: EdgeRuntime.waitUntil. 없으면(런타임 미지원) 응답 뒤 발송을 보장할 수 없으므로 500(fail-closed)
  waitUntil?: (p: Promise<unknown>) => void;
  bodyTimeoutMs?: number; // 테스트용. 기본 BODY_TIMEOUT_MS
}

export function loadConfig(env: Record<string, string | undefined>): Config | null {
  if (REQUIRED_ENV.some((k) => !env[k]?.trim())) return null;
  const hostnames = env.TURNSTILE_HOSTNAMES!.split(",").map((s) => s.trim()).filter(Boolean);
  if (hostnames.length === 0) return null;
  const mail = loadMailConfig(env);
  if (!mail) return null;
  return {
    ...mail,
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

const logReason = (reason: string) => log("waitlist", reason);

// 32바이트 랜덤 → base64url(패딩 없음, 43자)
export function newConfirmToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface Input {
  email: string;
  token: string;
}

function parseInput(raw: string): Input | null {
  const o = parseObject(raw);
  if (!o) return null;
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
    const waitUntil = deps.waitUntil;
    if (typeof waitUntil !== "function") {
      logReason("wait_until_unsupported");
      return error(500, "INTERNAL", cors);
    }

    // 본문 초과·수신 지연도 기존 코드 재사용(400 INVALID_INPUT), 사유는 로그로만 구분
    const raw = await readBody(req, deps.bodyTimeoutMs ?? BODY_TIMEOUT_MS);
    const input = isBodyFailure(raw) ? null : parseInput(raw);
    if (!input) {
      logReason(isBodyFailure(raw) ? raw : "invalid_input");
      return error(400, "INVALID_INPUT", cors);
    }

    const { key, ip, rawIp, unknown } = await ipRateKey(req.headers, cfg.rateSalt);
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

    const ts = await deps.verifyTurnstile(cfg, input.token, ip && !ip.endsWith("/64") ? ip : rawIp);
    if (ts === "unavailable") {
      logReason("turnstile_unavailable");
      return error(503, "SERVICE_UNAVAILABLE", cors);
    }
    if (ts !== "ok") {
      logReason("turnstile_rejected");
      return error(400, "INVALID_INPUT", cors);
    }

    const token = newConfirmToken();
    let send: boolean;
    try {
      send = await deps.requestConfirm(cfg, input.email, await sha256Hex(token), {
        ttlSec: CONFIRM_TTL_SEC,
        maxSends: CONFIRM_MAX_SENDS,
        windowSec: CONFIRM_WINDOW_SEC,
      });
    } catch {
      logReason("request_confirm_failed");
      return error(503, "SERVICE_UNAVAILABLE", cors);
    }
    if (send) {
      waitUntil(
        deps.sendMail(cfg, confirmMail(cfg, input.email, token)).catch(() => logReason("mail_failed")),
      );
    }
    return new Response(null, { status: 202, headers: cors });
  };
}
