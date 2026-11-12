// 공개 EF 공통: CORS · 오류 응답 · 본문 읽기(크기·시간 제한) · 사유 코드 로그 · sha256 · 레이트리밋 키.
import { clientIp, normalizeIp } from "./ip.ts";

export const MAX_BODY_BYTES = 4096;
export const BODY_TIMEOUT_MS = 5000;
export const DEFAULT_RATE_WINDOW_SEC = 600;
export const DEFAULT_RATE_MAX = 5;

const MESSAGES: Record<string, string> = {
  INVALID_INPUT: "입력값을 확인해 주세요.",
  RATE_LIMITED: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  SERVICE_UNAVAILABLE: "일시적인 오류입니다. 잠시 후 다시 시도해 주세요.",
  METHOD_NOT_ALLOWED: "허용되지 않은 요청입니다.",
  INTERNAL: "서버 설정 오류입니다.",
};

export function positiveInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function corsHeaders(origin: string | undefined): Record<string, string> {
  if (!origin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-max-age": "600",
    "access-control-expose-headers": "Retry-After", // 브라우저가 429 대기 시간을 읽게
    vary: "Origin",
  };
}

export function error(status: number, code: string, cors: Record<string, string>, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: { code, message: MESSAGES[code] } }), {
    status,
    headers: { ...cors, ...extra, "content-type": "application/json; charset=utf-8" },
  });
}

// 로그에는 사유 코드만 남긴다(이메일·IP·토큰 원문 금지).
export function logReason(fn: string, reason: string) {
  console.warn(JSON.stringify({ fn, reason }));
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface IpKey {
  key: string; // sha256(salt || 정규화 IP), 접두 포함
  ip: string | null; // 정규화 IP(IPv6는 /64)
  rawIp: string | null;
  unknown: boolean; // IP를 못 구해 공통 키로 묶였는지
}

// IP를 못 구하면 공통 키("unknown")로 묶어 제한한다(원문은 남기지 않음).
export async function ipRateKey(headers: Headers, salt: string, prefix = ""): Promise<IpKey> {
  const rawIp = clientIp(headers);
  const ip = normalizeIp(rawIp);
  return { key: prefix + (await sha256Hex(salt + (ip ?? "unknown"))), ip, rawIp, unknown: !ip };
}

export type BodyFailure = "body_too_large" | "body_timeout" | "invalid_input";

export function isBodyFailure(v: string): v is BodyFailure {
  return v === "body_too_large" || v === "body_timeout" || v === "invalid_input";
}

// 본문을 바이트 기준 MAX_BODY_BYTES까지만, timeoutMs 안에 읽는다. 초과·지연 즉시 중단.
export async function readBody(req: Request, timeoutMs: number): Promise<string | BodyFailure> {
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

// JSON 객체 본문만 허용(배열·원시값 거부).
export function parseObject(raw: string): Record<string, unknown> | null {
  let b: unknown;
  try {
    b = JSON.parse(raw);
  } catch {
    return null;
  }
  return typeof b === "object" && b !== null && !Array.isArray(b) ? b as Record<string, unknown> : null;
}
