// service_role로 PostgREST를 직접 호출한다(supabase-js 의존성 없이 fetch만).
// 오류 메시지에는 HTTP 상태만 담는다 — 이메일·DB 원문 오류를 남기지 않는다.
const DB_TIMEOUT_MS = 5000;

export interface RestConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

function headers(cfg: RestConfig): HeadersInit {
  return {
    apikey: cfg.serviceRoleKey,
    authorization: `Bearer ${cfg.serviceRoleKey}`,
    "content-type": "application/json",
  };
}

// PostgREST RPC 호출 → boolean 결과. 실패는 `<tag>_http_<상태>`·`<tag>_bad_response`.
async function rpcBool(cfg: RestConfig, fn: string, tag: string, args: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(DB_TIMEOUT_MS),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`${tag}_http_${res.status}`);
  }
  const v = await res.json();
  if (typeof v !== "boolean") throw new Error(`${tag}_bad_response`);
  return v;
}

export function rateHit(cfg: RestConfig, key: string, windowSec: number, max: number): Promise<boolean> {
  return rpcBool(cfg, "waitlist_rate_hit", "rate_hit", { p_key: key, p_window_sec: windowSec, p_max: max });
}

// A-15: 미확인 행만 토큰 해시·만료·발송 카운트 갱신(원자). true = 확인 메일 발송.
export function requestConfirm(
  cfg: RestConfig,
  email: string,
  tokenHash: string,
  o: { ttlSec: number; maxSends: number; windowSec: number },
): Promise<boolean> {
  return rpcBool(cfg, "waitlist_request_confirm", "request_confirm", {
    p_email: email,
    p_token_hash: tokenHash,
    p_ttl_sec: o.ttlSec,
    p_max_sends: o.maxSends,
    p_window_sec: o.windowSec,
  });
}

// A-19: 미만료 토큰 해시 일치 → 확정(이미 확정도 true).
export function confirmToken(cfg: RestConfig, tokenHash: string): Promise<boolean> {
  return rpcBool(cfg, "waitlist_confirm", "confirm", { p_token_hash: tokenHash });
}
