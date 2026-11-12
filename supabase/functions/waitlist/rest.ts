// service_role로 PostgREST를 직접 호출한다(supabase-js 의존성 없이 fetch만).
// 오류 메시지에는 HTTP 상태만 담는다 — 이메일·DB 원문 오류를 남기지 않는다.
const DB_TIMEOUT_MS = 5000;

export interface RestConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

function headers(cfg: RestConfig, prefer?: string): HeadersInit {
  const h: Record<string, string> = {
    apikey: cfg.serviceRoleKey,
    authorization: `Bearer ${cfg.serviceRoleKey}`,
    "content-type": "application/json",
  };
  if (prefer) h.prefer = prefer;
  return h;
}

export async function rateHit(cfg: RestConfig, key: string, windowSec: number, max: number): Promise<boolean> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/waitlist_rate_hit`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ p_key: key, p_window_sec: windowSec, p_max: max }),
    signal: AbortSignal.timeout(DB_TIMEOUT_MS),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`rate_hit_http_${res.status}`);
  }
  const v = await res.json();
  if (typeof v !== "boolean") throw new Error("rate_hit_bad_response");
  return v;
}

// INSERT ... ON CONFLICT (email_norm) DO UPDATE — 재신청은 동의 시각을 갱신한다.
export async function insertSignup(cfg: RestConfig, email: string): Promise<void> {
  const res = await fetch(
    `${cfg.supabaseUrl}/rest/v1/waitlist_signups?on_conflict=email_norm&columns=email,consent_marketing,age_confirmed,consented_at`,
    {
      method: "POST",
      headers: headers(cfg, "resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify({
        email,
        consent_marketing: true,
        age_confirmed: true,
        consented_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(DB_TIMEOUT_MS),
    },
  );
  await res.body?.cancel();
  if (!res.ok) throw new Error(`insert_http_${res.status}`);
}
