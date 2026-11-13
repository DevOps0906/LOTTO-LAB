// 오프라인 단위 테스트: npx deno test supabase/functions/account-delete/ (네트워크·DB 없이 가짜 deps)
import assert from "node:assert/strict";
import { sha256Hex } from "../_shared/http.ts";
import type { AuthUser } from "./auth.ts";
import { createHandler, type Deps, RATE_KEY_PREFIX } from "./handler.ts";

const ORIGIN = "https://localhost";
const ENV = {
  SUPABASE_URL: "http://db.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  RATE_SALT: "test-salt",
  ALLOWED_ORIGIN: ORIGIN,
};
const A = "00000000-0000-4000-8000-00000000a001";
const B = "00000000-0000-4000-8000-00000000b001";
const NOW = 1_800_000_000; // 고정 시각(초)
const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
// 서명은 가짜(getUser가 판정). payload의 amr만 handler가 읽는다.
const jwt = (sub: string, amr: unknown) => `eyJhbGciOiJFUzI1NiJ9.${b64url({ sub, amr })}.c2ln`;
const fresh = (method = "password", age = 30) => [{ method, timestamp: NOW - age }];
const JWT_A = jwt("a", fresh());
const JWT_B = jwt("b", fresh("otp"));

interface Fake {
  deps: Deps;
  hits: Map<string, number>;
  deleted: string[];
  lookups: number;
}

type Over = Partial<{
  users: Record<string, AuthUser>;
  getThrows: boolean;
  rateThrows: boolean;
  deleteThrows: boolean;
  env: Record<string, string | undefined>;
}>;

function fake(over: Over = {}): Fake {
  const users = over.users ?? { [JWT_A]: { kind: "ok", id: A }, [JWT_B]: { kind: "ok", id: B } };
  const f: Fake = {
    hits: new Map(),
    deleted: [],
    lookups: 0,
    deps: {
      env: over.env ?? ENV,
      nowSec: () => NOW,
      getUser: (_cfg, jwt) => {
        f.lookups++;
        if (over.getThrows) return Promise.reject(new Error("auth down"));
        return Promise.resolve(users[jwt] ?? { kind: "invalid" });
      },
      rateHit: (_cfg, key, _w, max) => {
        if (over.rateThrows) return Promise.reject(new Error("db down"));
        const n = (f.hits.get(key) ?? 0) + 1;
        f.hits.set(key, n);
        return Promise.resolve(n <= max);
      },
      deleteUser: (_cfg, id) => {
        if (over.deleteThrows) return Promise.reject(new Error("admin api down"));
        f.deleted.push(id);
        return Promise.resolve();
      },
    },
  };
  return f;
}

function post(auth: string | null, body: unknown = null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth !== null) headers.authorization = auth;
  return new Request("http://fn.test/account-delete", {
    method: "POST",
    headers,
    body: body === null ? null : JSON.stringify(body),
  });
}

async function code(res: Response): Promise<string> {
  return (await res.json()).error.code;
}

Deno.test("delete: OPTIONS 204 + CORS, GET 405", async () => {
  const h = createHandler(fake().deps);
  const o = await h(new Request("http://fn.test/x", { method: "OPTIONS" }));
  assert.equal(o.status, 204);
  assert.equal(o.headers.get("access-control-allow-origin"), ORIGIN);
  const g = await h(new Request("http://fn.test/x", { method: "GET" }));
  assert.equal(g.status, 405);
  assert.equal(await code(g), "METHOD_NOT_ALLOWED");
});

Deno.test("delete: 필수 env 누락 → 500, 외부 호출 없음", async () => {
  for (const k of Object.keys(ENV)) {
    const f = fake({ env: { ...ENV, [k]: undefined } });
    const res = await createHandler(f.deps)(post(`Bearer ${JWT_A}`));
    assert.equal(res.status, 500, k);
    assert.equal(f.lookups, 0);
    assert.deepEqual(f.deleted, []);
  }
});

Deno.test("delete: JWT 없음·형식 오류 → 401, Auth 호출 없음", async () => {
  const f = fake();
  for (const a of [null, "", "Bearer", `Basic ${JWT_A}`, "Bearer abc", `Bearer ${JWT_A} x`, `bearer${JWT_A}`, `Bearer	${JWT_A}`]) {
    const res = await createHandler(f.deps)(post(a));
    assert.equal(res.status, 401, String(a));
    assert.equal(await code(res), "UNAUTHENTICATED");
  }
  assert.equal(f.lookups, 0);
  assert.deepEqual(f.deleted, []);
});

Deno.test("delete: Auth가 거부한 토큰 → 401, 삭제 없음", async () => {
  const f = fake();
  const res = await createHandler(f.deps)(post("Bearer x.y.z"));
  assert.equal(res.status, 401);
  assert.equal(await code(res), "UNAUTHENTICATED");
  assert.deepEqual(f.deleted, []);
});

Deno.test("delete: 본인만 삭제 — 본문의 다른 user_id는 무시", async () => {
  const f = fake();
  const res = await createHandler(f.deps)(post(`Bearer ${JWT_B}`, { user_id: A }));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "");
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  assert.deepEqual(f.deleted, [B]);
});

Deno.test("delete: 이미 삭제된 사용자의 유효 토큰 → 200(멱등), 삭제 호출 없음", async () => {
  const f = fake({ users: { [JWT_A]: { kind: "gone" } } });
  const res = await createHandler(f.deps)(post(`Bearer ${JWT_A}`));
  assert.equal(res.status, 200);
  assert.deepEqual(f.deleted, []);
  assert.equal(f.hits.size, 0);
});

Deno.test("delete: 같은 사용자 6번째 → 429 + Retry-After, 키는 delete: 접두·사용자별", async () => {
  const f = fake();
  const h = createHandler(f.deps);
  for (let i = 0; i < 5; i++) assert.equal((await h(post(`Bearer ${JWT_A}`))).status, 200);
  const res = await h(post(`Bearer ${JWT_A}`));
  assert.equal(res.status, 429);
  assert.equal(await code(res), "RATE_LIMITED");
  assert.equal(res.headers.get("retry-after"), "600");
  assert.equal(f.deleted.length, 5);
  assert.equal((await h(post(`Bearer ${JWT_B}`))).status, 200); // 다른 사용자는 별도 키
  assert.deepEqual([...f.hits.keys()], [
    RATE_KEY_PREFIX + await sha256Hex("test-salt" + A),
    RATE_KEY_PREFIX + await sha256Hex("test-salt" + B),
  ]);
});

Deno.test("delete: Auth·레이트리밋·삭제 오류 → 503", async () => {
  for (const o of [{ getThrows: true }, { rateThrows: true }, { deleteThrows: true }]) {
    const res = await createHandler(fake(o).deps)(post(`Bearer ${JWT_A}`));
    assert.equal(res.status, 503, JSON.stringify(o));
    assert.equal(await code(res), "SERVICE_UNAVAILABLE");
  }
});

Deno.test("delete: Bearer 스킴 대소문자 무시·공백 1칸 이상 허용", async () => {
  for (const a of [`bearer ${JWT_A}`, `BEARER ${JWT_A}`, `Bearer   ${JWT_A}`, `  Bearer ${JWT_A}  `]) {
    const f = fake();
    const res = await createHandler(f.deps)(post(a));
    assert.equal(res.status, 200, a.slice(0, 12));
    assert.deepEqual(f.deleted, [A]);
  }
});

Deno.test("delete: ALLOWED_ORIGIN '*'·공백 → 500 설정 오류, CORS 헤더 없음, 외부 호출 없음", async () => {
  for (const o of ["*", " * ", "   "]) {
    const f = fake({ env: { ...ENV, ALLOWED_ORIGIN: o } });
    const res = await createHandler(f.deps)(post(`Bearer ${JWT_A}`));
    assert.equal(res.status, 500, JSON.stringify(o));
    assert.equal(await code(res), "INTERNAL");
    assert.equal(res.headers.get("access-control-allow-origin"), null);
    assert.equal(f.lookups, 0);
  }
});

Deno.test("delete: 최근 재인증 없음 → 403 REAUTH_REQUIRED, 삭제·레이트리밋 없음", async () => {
  const stale: unknown[] = [
    fresh("password", 601), // 10분 초과
    fresh("otp", 3600),
    [{ method: "oauth", timestamp: NOW - 10 }], // 허용 방식 아님
    [{ method: "token_refresh", timestamp: NOW - 10 }],
    [{ method: "password", timestamp: NOW + 3600 }], // 미래 시각
    [{ method: "password", timestamp: String(NOW) }],
    [],
    undefined,
  ];
  for (const amr of stale) {
    const t = jwt("a", amr);
    const f = fake({ users: { [t]: { kind: "ok", id: A } } });
    const res = await createHandler(f.deps)(post(`Bearer ${t}`));
    assert.equal(res.status, 403, JSON.stringify(amr));
    assert.equal(await code(res), "REAUTH_REQUIRED");
    assert.deepEqual(f.deleted, []);
    assert.equal(f.hits.size, 0);
  }
  // 경계: 정확히 600초 전은 허용, 여러 항목 중 하나라도 최근이면 허용
  for (const amr of [fresh("password", 600), [{ method: "oauth", timestamp: NOW - 5000 }, ...fresh("otp", 5)]]) {
    const t = jwt("a", amr);
    const f = fake({ users: { [t]: { kind: "ok", id: A } } });
    assert.equal((await createHandler(f.deps)(post(`Bearer ${t}`))).status, 200, JSON.stringify(amr));
  }
});
