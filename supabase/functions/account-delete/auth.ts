// GoTrue(Auth) 호출: 사용자 JWT 확인 · 관리자 API로 사용자 삭제. supabase-js 없이 fetch만.
// 오류 메시지에는 HTTP 상태만 담는다 — 토큰·이메일·원문 오류를 남기지 않는다.
import type { RestConfig } from "../_shared/rest.ts";

const AUTH_TIMEOUT_MS = 5000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ok = 서명·만료가 유효한 현재 사용자 · invalid = 토큰 거부 · gone = 서명은 유효하나 사용자가 이미 없음(삭제 완료)
export type AuthUser = { kind: "ok"; id: string } | { kind: "invalid" } | { kind: "gone" };

export async function getUser(cfg: RestConfig, jwt: string): Promise<AuthUser> {
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: cfg.serviceRoleKey, authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null) as { id?: unknown; error_code?: unknown } | null;
  if (res.ok) {
    if (typeof body?.id === "string" && UUID_RE.test(body.id)) return { kind: "ok", id: body.id };
    throw new Error("get_user_bad_response");
  }
  if (res.status === 401 || res.status === 403) {
    return body?.error_code === "user_not_found" ? { kind: "gone" } : { kind: "invalid" };
  }
  throw new Error(`get_user_http_${res.status}`);
}

// 하드 삭제(auth.users 행 삭제 → 사용자 테이블 ON DELETE CASCADE). 이미 없음(404)도 성공(멱등).
export async function deleteUser(cfg: RestConfig, id: string): Promise<void> {
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: {
      apikey: cfg.serviceRoleKey,
      authorization: `Bearer ${cfg.serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ should_soft_delete: false }),
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  });
  await res.body?.cancel();
  if (!res.ok && res.status !== 404) throw new Error(`delete_user_http_${res.status}`);
}
