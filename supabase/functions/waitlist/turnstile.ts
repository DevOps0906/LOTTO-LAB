// Cloudflare Turnstile siteverify (https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const SITEVERIFY_TIMEOUT_MS = 5000;

export type TurnstileResult = "ok" | "rejected" | "unavailable";

export interface TurnstileOptions {
  secret: string;
  hostnames: string[];
  token: string;
  remoteIp: string | null;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

// ok: 통과 · rejected: 토큰·호스트 불일치(400) · unavailable: 장애·타임아웃(503)
export async function verifyTurnstile(o: TurnstileOptions): Promise<TurnstileResult> {
  const body = new URLSearchParams({ secret: o.secret, response: o.token });
  if (o.remoteIp) body.set("remoteip", o.remoteIp);
  try {
    const res = await (o.fetchFn ?? fetch)(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(o.timeoutMs ?? SITEVERIFY_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel();
      return "unavailable";
    }
    const data = await res.json();
    if (data?.success === true && typeof data.hostname === "string" && o.hostnames.includes(data.hostname)) {
      return "ok";
    }
    const codes: unknown = data?.["error-codes"];
    if (Array.isArray(codes) && codes.includes("internal-error")) return "unavailable";
    return "rejected";
  } catch {
    return "unavailable";
  }
}
