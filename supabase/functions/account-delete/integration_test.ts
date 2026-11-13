// 통합 테스트: handler(A-20) + 실제 auth.ts·_shared/rest.ts + 로컬 Auth(GoTrue)·DB(PostgREST).
// 실행(로컬 스택 기동 후): waitlist 통합 테스트와 같은 환경변수·명령(supabase/README.md "통합 테스트").
//   WAITLIST_IT_URL=http://127.0.0.1:54521 WAITLIST_IT_SERVICE_KEY=<supabase status의 SERVICE_ROLE_KEY> ...
// 환경변수가 없으면 건너뛴다(오프라인 단위 테스트만 실행).
import assert from "node:assert/strict";
import { rateHit } from "../_shared/rest.ts";
import { deleteUser, getUser } from "./auth.ts";
import { createHandler } from "./handler.ts";

function itEnv(): { url: string; key: string } | null {
  try {
    const url = Deno.env.get("WAITLIST_IT_URL")?.replace(/\/+$/, "");
    const key = Deno.env.get("WAITLIST_IT_SERVICE_KEY");
    return url && key ? { url, key } : null;
  } catch {
    return null; // --allow-env 없이 실행
  }
}
const IT = itEnv();
const RUN = crypto.randomUUID().slice(0, 8);
const PASSWORD = "itPass1234";

function handler(nowSec?: () => number) {
  return createHandler({
    nowSec,
    env: {
      SUPABASE_URL: IT!.url,
      SUPABASE_SERVICE_ROLE_KEY: IT!.key,
      RATE_SALT: `it-${crypto.randomUUID()}`, // 실행마다 고유 레이트리밋 키
      ALLOWED_ORIGIN: "https://localhost",
    },
    getUser,
    rateHit,
    deleteUser,
  });
}

function call(h: (r: Request) => Promise<Response>, auth: string | null, body: unknown = null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth !== null) headers.authorization = auth;
  return h(new Request("http://fn.test/account-delete", {
    method: "POST",
    headers,
    body: body === null ? null : JSON.stringify(body),
  }));
}

const admin = () => ({ apikey: IT!.key, authorization: `Bearer ${IT!.key}`, "content-type": "application/json" });

// 확인 완료 사용자 생성(관리자 API) → 비밀번호 로그인 → { id, token }
async function makeUser(tag: string): Promise<{ id: string; token: string; email: string }> {
  const email = `it-${RUN}-${tag}@synthetic.invalid`;
  const c = await fetch(`${IT!.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: admin(),
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  assert.equal(c.status, 200, `create ${tag}`);
  const { id } = await c.json();
  return { id, email, token: (await relogin(email)).token };
}

// 비밀번호 로그인 → 새 액세스 토큰(amr password timestamp = 지금)
async function relogin(email: string): Promise<{ token: string }> {
  const t = await fetch(`${IT!.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: IT!.key, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(t.status, 200, "login");
  return { token: (await t.json()).access_token };
}

// 사용자 토큰으로 PostgREST(RLS) 호출
function rest(token: string, path: string, init: RequestInit = {}) {
  return fetch(`${IT!.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: IT!.key, authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
  });
}

async function userExists(id: string): Promise<boolean> {
  const r = await fetch(`${IT!.url}/auth/v1/admin/users/${id}`, { headers: admin() });
  await r.body?.cancel();
  if (r.status === 404) return false;
  assert.equal(r.status, 200);
  return true;
}

async function count(token: string, table: string, uid: string): Promise<number> {
  const r = await rest(token, `${table}?select=user_id&user_id=eq.${uid}`);
  assert.equal(r.status, 200, table);
  return (await r.json()).length;
}

Deno.test({
  name: "IT account-delete: JWT 없음·위조 → 401, 본인만 삭제 + CASCADE, 재호출 200(멱등)",
  ignore: !IT,
  sanitizeResources: false,
  fn: async () => {
    const h = handler();
    const a = await makeUser("a");
    const b = await makeUser("b");

    // A의 개인 데이터(동의 기록·사주 프로필)
    const c1 = await rest(a.token, "user_consents", {
      method: "POST",
      body: JSON.stringify({ user_id: a.id, terms_version: "2026-11-13", privacy_version: "2026-11-13", adult_confirmed: true }),
    });
    assert.equal(c1.status, 201);
    await c1.body?.cancel();
    const f1 = await rest(a.token, "fortune_profiles", {
      method: "POST",
      body: JSON.stringify({ user_id: a.id, birth_date: "1990-05-17", calendar: "solar" }),
    });
    assert.equal(f1.status, 201);
    await f1.body?.cancel();
    assert.equal(await count(a.token, "user_consents", a.id), 1);
    assert.equal(await count(a.token, "fortune_profiles", a.id), 1);

    // JWT 없음 · 형식 오류 · 서명 위조 → 401, 아무도 삭제되지 않음
    for (const auth of [null, "Bearer not-a-jwt", `Bearer ${a.token.slice(0, -4)}AAAA`]) {
      const res = await call(h, auth);
      assert.equal(res.status, 401, String(auth).slice(0, 20));
      assert.equal((await res.json()).error.code, "UNAUTHENTICATED");
    }
    assert.equal(await userExists(a.id), true);
    assert.equal(await userExists(b.id), true);

    // B 토큰 + 본문에 A의 user_id → B만 삭제, A는 그대로
    const rb = await call(h, `Bearer ${b.token}`, { user_id: a.id });
    assert.equal(rb.status, 200);
    await rb.body?.cancel();
    assert.equal(await userExists(b.id), false);
    assert.equal(await userExists(a.id), true);
    assert.equal(await count(a.token, "user_consents", a.id), 1);

    // A 본인 삭제 → auth 사용자 삭제 + CASCADE 파기(만료 전 A 토큰으로 0행 확인)
    const ra = await call(h, `Bearer ${a.token}`);
    assert.equal(ra.status, 200);
    await ra.body?.cancel();
    assert.equal(await userExists(a.id), false);
    assert.equal(await count(a.token, "user_consents", a.id), 0);
    assert.equal(await count(a.token, "fortune_profiles", a.id), 0);

    // 같은 토큰 재호출 → 200(이미 삭제됨, 멱등)
    const again = await call(h, `Bearer ${a.token}`);
    assert.equal(again.status, 200);
    await again.body?.cancel();
  },
});

Deno.test({
  name: "IT account-delete: 로그인 10분 초과 토큰 → 403 REAUTH_REQUIRED, 새 로그인 토큰 → 200",
  ignore: !IT,
  sanitizeResources: false,
  fn: async () => {
    const c = await makeUser("reauth");
    // 같은 토큰을 11분 뒤 시각으로 판정(amr password timestamp가 오래됨)
    const later = handler(() => Math.floor(Date.now() / 1000) + 660);
    const old = await call(later, `Bearer ${c.token}`);
    assert.equal(old.status, 403);
    assert.equal((await old.json()).error.code, "REAUTH_REQUIRED");
    assert.equal(await userExists(c.id), true);
    // 앱 흐름: 비밀번호 재입력 → 새 토큰(현재 시각 기준)으로 삭제
    const res = await call(handler(), `Bearer ${(await relogin(c.email)).token}`);
    assert.equal(res.status, 200);
    await res.body?.cancel();
    assert.equal(await userExists(c.id), false);
  },
});
