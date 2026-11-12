// 통합 테스트: handler + 실제 rest.ts + 로컬 DB(PostgREST). Turnstile만 가짜.
// 실행(로컬 스택 기동 후):
//   WAITLIST_IT_URL=http://127.0.0.1:54521 WAITLIST_IT_SERVICE_KEY=<supabase status의 SERVICE_ROLE_KEY> \
//   npx deno@2.9.6 test --no-prompt --allow-env --allow-net=127.0.0.1:54521 supabase/functions/waitlist/
// 환경변수가 없으면 건너뛴다(오프라인 단위 테스트만 실행).
import assert from "node:assert/strict";
import { createHandler, type Deps } from "./handler.ts";
import { insertSignup, rateHit } from "./rest.ts";

function itEnv(): { url: string; key: string } | null {
  try {
    const url = Deno.env.get("WAITLIST_IT_URL");
    const key = Deno.env.get("WAITLIST_IT_SERVICE_KEY");
    return url && key ? { url, key } : null;
  } catch {
    return null; // --allow-env 없이 실행
  }
}
const IT = itEnv();
const RUN = crypto.randomUUID().slice(0, 8);

function deps(rateMax: number): Deps {
  return {
    env: {
      SUPABASE_URL: IT!.url,
      SUPABASE_SERVICE_ROLE_KEY: IT!.key,
      TURNSTILE_SECRET: "unused",
      TURNSTILE_HOSTNAMES: "example.com",
      RATE_SALT: `it-${crypto.randomUUID()}`, // 테스트마다 고유 레이트리밋 키
      ALLOWED_ORIGIN: "http://localhost:3000",
      WAITLIST_RATE_MAX: String(rateMax),
    },
    verifyTurnstile: () => Promise.resolve("ok"),
    rateHit,
    insert: insertSignup,
  };
}

function post(email: string) {
  return new Request("http://fn.test/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "198.51.100.10" },
    body: JSON.stringify({ email, consent_marketing: true, age_confirmed: true, turnstile_token: "t" }),
  });
}

async function rows(emailNormPrefix: string): Promise<{ email_norm: string; consented_at: string; created_at: string }[]> {
  const res = await fetch(
    `${IT!.url}/rest/v1/waitlist_signups?select=email_norm,consented_at,created_at&email_norm=like.${encodeURIComponent(emailNormPrefix)}*`,
    { headers: { apikey: IT!.key, authorization: `Bearer ${IT!.key}` } },
  );
  assert.equal(res.status, 200);
  return await res.json();
}

async function cleanup(prefix: string) {
  const res = await fetch(`${IT!.url}/rest/v1/waitlist_signups?email_norm=like.${encodeURIComponent(prefix)}*`, {
    method: "DELETE",
    headers: { apikey: IT!.key, authorization: `Bearer ${IT!.key}` },
  });
  await res.body?.cancel();
}

Deno.test({
  name: "통합: 신규 202 · 중복 202 + consented_at 갱신(행 1개)",
  ignore: !IT,
  fn: async () => {
    const prefix = `it-${RUN}-dup`;
    try {
      const h = createHandler(deps(5));
      const r1 = await h(post(`${prefix}@Example.com`));
      assert.equal(r1.status, 202);
      const [first] = await rows(prefix);
      await new Promise((r) => setTimeout(r, 20));
      const r2 = await h(post(`  ${prefix.toUpperCase()}@example.COM `));
      assert.equal(r2.status, 202);
      const after = await rows(prefix);
      assert.equal(after.length, 1);
      assert.equal(after[0].created_at, first.created_at);
      assert.ok(new Date(after[0].consented_at) > new Date(first.consented_at), "consented_at 갱신");
    } finally {
      await cleanup(prefix);
    }
  },
});

Deno.test({
  name: "통합: 동시 요청 N=20 > 한도 5 → 허용 건수 == 5 (원자성)",
  ignore: !IT,
  fn: async () => {
    const prefix = `it-${RUN}-race`;
    try {
      const h = createHandler(deps(5));
      const res = await Promise.all(Array.from({ length: 20 }, (_, i) => h(post(`${prefix}-${i}@example.com`))));
      const statuses = res.map((r) => r.status);
      await Promise.all(res.map((r) => r.body?.cancel()));
      assert.equal(statuses.filter((s) => s === 202).length, 5, statuses.join(","));
      assert.equal(statuses.filter((s) => s === 429).length, 15, statuses.join(","));
      assert.equal((await rows(prefix)).length, 5);
    } finally {
      await cleanup(prefix);
    }
  },
});
