// 오프라인 단위 테스트: npx deno test supabase/functions/waitlist-confirm/ (네트워크·DB 없이 가짜 deps)
import assert from "node:assert/strict";
import { sha256Hex } from "../_shared/http.ts";
import { createHandler, type Deps, RATE_KEY_PREFIX } from "./handler.ts";

const ORIGIN = "https://lotto-lab.example";
const ENV = {
  SUPABASE_URL: "http://db.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  RATE_SALT: "test-salt",
  ALLOWED_ORIGIN: ORIGIN,
};
const TOKEN = "A".repeat(42) + "_"; // 43자 base64url

interface Fake {
  deps: Deps;
  hits: Map<string, number>;
  hashes: string[];
}

function fake(over: Partial<{ valid: Set<string>; rateThrows: boolean; confirmThrows: boolean; env: Record<string, string | undefined> }> = {}): Fake {
  const f: Fake = {
    hits: new Map(),
    hashes: [],
    deps: {
      env: over.env ?? ENV,
      rateHit: (_cfg, key, _w, max) => {
        if (over.rateThrows) return Promise.reject(new Error("db down"));
        const n = (f.hits.get(key) ?? 0) + 1;
        f.hits.set(key, n);
        return Promise.resolve(n <= max);
      },
      confirm: (_cfg, hash) => {
        if (over.confirmThrows) return Promise.reject(new Error("rpc failed"));
        f.hashes.push(hash);
        return Promise.resolve(over.valid?.has(hash) ?? false);
      },
    },
  };
  return f;
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://fn.test/waitlist-confirm", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function code(res: Response): Promise<string> {
  return (await res.json()).error.code;
}

Deno.test("confirm: OPTIONS 204 + CORS, GET 405", async () => {
  const h = createHandler(fake().deps);
  const o = await h(new Request("http://fn.test/x", { method: "OPTIONS" }));
  assert.equal(o.status, 204);
  assert.equal(o.headers.get("access-control-allow-origin"), ORIGIN);
  const g = await h(new Request("http://fn.test/x", { method: "GET" }));
  assert.equal(g.status, 405);
  assert.equal(await code(g), "METHOD_NOT_ALLOWED");
});

Deno.test("confirm: 필수 env 누락 → 500, 외부 호출 없음", async () => {
  for (const k of Object.keys(ENV)) {
    const f = fake({ env: { ...ENV, [k]: undefined } });
    const res = await createHandler(f.deps)(post({ token: TOKEN }));
    assert.equal(res.status, 500, k);
    assert.equal(f.hits.size, 0);
  }
});

Deno.test("confirm: 유효 토큰 → 200 빈 본문, RPC에는 sha256 해시만", async () => {
  const hash = await sha256Hex(TOKEN);
  const f = fake({ valid: new Set([hash]) });
  const h = createHandler(f.deps);
  const r1 = await h(post({ token: TOKEN }));
  assert.equal(r1.status, 200);
  assert.equal(await r1.text(), "");
  assert.deepEqual(f.hashes, [hash]);
  const r2 = await h(post({ token: TOKEN })); // 재제출도 200(RPC가 true)
  assert.equal(r2.status, 200);
});

Deno.test("confirm: 없음·만료 토큰 → 400 INVALID_INPUT", async () => {
  const res = await createHandler(fake().deps)(post({ token: TOKEN }));
  assert.equal(res.status, 400);
  assert.equal(await code(res), "INVALID_INPUT");
});

Deno.test("confirm: 형식 오류 → 400, 레이트리밋 전 차단", async () => {
  const bad: unknown[] = ["{x", [], { token: 1 }, { token: "short" }, { token: TOKEN + "A" }, { token: "A".repeat(42) + "=" }, {}];
  const f = fake();
  for (const b of bad) {
    const res = await createHandler(f.deps)(post(b));
    assert.equal(res.status, 400, JSON.stringify(b));
    assert.equal(await code(res), "INVALID_INPUT");
  }
  const big = await createHandler(f.deps)(post({ token: TOKEN, pad: "x".repeat(5000) }));
  assert.equal(big.status, 400);
  assert.equal(f.hits.size, 0);
});

Deno.test("confirm: 같은 IP 6번째 → 429 + Retry-After, 키는 confirm: 접두", async () => {
  const f = fake();
  const h = createHandler(f.deps);
  for (let i = 0; i < 5; i++) assert.equal((await h(post({ token: TOKEN }))).status, 400);
  const res = await h(post({ token: TOKEN }));
  assert.equal(res.status, 429);
  assert.equal(await code(res), "RATE_LIMITED");
  assert.equal(res.headers.get("retry-after"), "600");
  assert.equal(res.headers.get("access-control-expose-headers"), "Retry-After");
  assert.deepEqual([...f.hits.keys()], [RATE_KEY_PREFIX + await sha256Hex("test-salt203.0.113.7")]);
});

Deno.test("confirm: 레이트리밋·RPC 오류 → 503", async () => {
  for (const o of [{ rateThrows: true }, { confirmThrows: true }]) {
    const res = await createHandler(fake(o).deps)(post({ token: TOKEN }));
    assert.equal(res.status, 503);
    assert.equal(await code(res), "SERVICE_UNAVAILABLE");
  }
});
