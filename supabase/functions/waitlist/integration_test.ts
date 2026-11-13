// 통합 테스트: handler(A-15·A-19) + 실제 _shared/rest.ts·mailer.ts + 로컬 DB(PostgREST) + Mailpit. Turnstile만 가짜.
// 실행(로컬 스택 기동 후, Mailpit 포함):
//   WAITLIST_IT_URL=http://127.0.0.1:54521 WAITLIST_IT_SERVICE_KEY=<supabase status의 SERVICE_ROLE_KEY> \
//   WAITLIST_IT_MAILPIT=http://127.0.0.1:54524 \
//   npx deno@2.9.6 test --no-prompt --allow-env --allow-net=127.0.0.1:54521,127.0.0.1:54524 supabase/functions/
// 환경변수가 없으면 건너뛴다(오프라인 단위 테스트만 실행).
import assert from "node:assert/strict";
import { confirmToken, rateHit, requestConfirm } from "../_shared/rest.ts";
import { sendMail } from "../_shared/mailer.ts";
import { createHandler as createConfirmHandler } from "../waitlist-confirm/handler.ts";
import { createHandler, type Deps } from "./handler.ts";

function itEnv(): { url: string; key: string; mailpit: string } | null {
  try {
    const url = Deno.env.get("WAITLIST_IT_URL");
    const key = Deno.env.get("WAITLIST_IT_SERVICE_KEY");
    const mailpit = Deno.env.get("WAITLIST_IT_MAILPIT")?.replace(/\/+$/, "");
    return url && key && mailpit ? { url, key, mailpit } : null;
  } catch {
    return null; // --allow-env 없이 실행
  }
}
const IT = itEnv();
const RUN = crypto.randomUUID().slice(0, 8);

const pending: Promise<unknown>[] = [];
// 응답 뒤 발송(waitUntil)된 메일이 Mailpit에 도착할 때까지 기다린다.
async function flush() {
  await Promise.all(pending.splice(0));
}

function env(rateMax: number) {
  return {
    SUPABASE_URL: IT!.url,
    SUPABASE_SERVICE_ROLE_KEY: IT!.key,
    TURNSTILE_SECRET: "unused",
    TURNSTILE_HOSTNAMES: "example.com",
    RATE_SALT: `it-${crypto.randomUUID()}`, // 테스트마다 고유 레이트리밋 키
    ALLOWED_ORIGIN: "http://localhost:3000",
    WAITLIST_RATE_MAX: String(rateMax),
    MAIL_API_URL: `${IT!.mailpit}/api/v1/send`,
    MAIL_API_KEY: "local-unused",
    MAIL_FROM: "noreply@lotto-lab.example",
    CONFIRM_BASE_URL: "http://localhost:3000",
  };
}

function deps(rateMax: number): Deps {
  return {
    env: env(rateMax),
    verifyTurnstile: () => Promise.resolve("ok"),
    rateHit,
    requestConfirm,
    sendMail: (cfg, msg) => sendMail(cfg, msg),
    waitUntil: (p) => pending.push(p),
  };
}

function confirmHandler() {
  return createConfirmHandler({ env: env(100), rateHit, confirm: confirmToken });
}

function confirmPost(token: string) {
  return new Request("http://fn.test/waitlist-confirm", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "198.51.100.10" },
    body: JSON.stringify({ token }),
  });
}

// Mailpit API: 수신자별 메일 본문 목록(오래된 순)
async function mailsTo(addr: string): Promise<string[]> {
  const q = encodeURIComponent(`to:"${addr}"`);
  const res = await fetch(`${IT!.mailpit}/api/v1/search?query=${q}`);
  assert.equal(res.status, 200);
  const { messages } = await res.json() as { messages: { ID: string; Created: string }[] };
  messages.sort((a, b) => a.Created.localeCompare(b.Created));
  const out: string[] = [];
  for (const m of messages) {
    const r = await fetch(`${IT!.mailpit}/api/v1/message/${m.ID}`);
    out.push((await r.json()).Text);
  }
  return out;
}

async function deleteMails(prefix: string) {
  const res = await fetch(`${IT!.mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${prefix}"`)}`, {
    method: "DELETE",
  });
  await res.body?.cancel();
}

function tokenOf(text: string): string {
  const t = text.match(/\/waitlist\/confirm#token=([A-Za-z0-9_-]{43})/)?.[1];
  assert.ok(t, "메일 본문에 확인 링크");
  return t;
}

function post(email: string) {
  return new Request("http://fn.test/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "198.51.100.10" },
    body: JSON.stringify({ email, consent_marketing: true, age_confirmed: true, turnstile_token: "t" }),
  });
}

interface Row {
  email_norm: string;
  consented_at: string;
  created_at: string;
  confirmed_at: string | null;
  confirm_sends: number;
}

async function rows(emailNormPrefix: string): Promise<Row[]> {
  const res = await fetch(
    `${IT!.url}/rest/v1/waitlist_signups?select=email_norm,consented_at,created_at,confirmed_at,confirm_sends&email_norm=like.${encodeURIComponent(emailNormPrefix)}*`,
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
  await flush();
  await deleteMails(prefix);
}

Deno.test({
  name: "통합: 신규 202 · 대소문자만 다른 중복 202(행 1개, 미만료 링크 있으면 메일·동의 시각 불변)",
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
      assert.equal(after[0].consented_at, first.consented_at);
      await flush();
      assert.equal((await mailsTo(`${prefix}@example.com`)).length, 1);
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

Deno.test({
  name: "통합: 신청 → Mailpit 메일 → 링크 토큰으로 A-19 200 → 재제출 200 · 위조 400 → 재신청 consented_at 불변·메일 없음",
  ignore: !IT,
  fn: async () => {
    const prefix = `it-${RUN}-ok`;
    const addr = `${prefix}@example.com`;
    try {
      const h = createHandler(deps(100));
      const c = confirmHandler();
      assert.equal((await h(post(addr))).status, 202);
      await flush();
      const mails = await mailsTo(addr);
      assert.equal(mails.length, 1);
      assert.ok(mails[0].includes("요청하지 않았다면"));
      const token = tokenOf(mails[0]);

      const r1 = await c(confirmPost(token));
      assert.equal(r1.status, 200);
      const [confirmed] = await rows(prefix);
      assert.ok(confirmed.confirmed_at, "confirmed_at 확정");
      assert.equal(confirmed.consented_at, confirmed.confirmed_at, "consented_at = 확인 시각");

      assert.equal((await c(confirmPost(token))).status, 200, "같은 토큰 재제출 200");
      const forged = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
      const r3 = await c(confirmPost(forged));
      assert.equal(r3.status, 400);
      assert.equal((await r3.json()).error.code, "INVALID_INPUT");

      await new Promise((r) => setTimeout(r, 20));
      assert.equal((await h(post(` ${addr.toUpperCase()} `))).status, 202, "확인된 이메일 재신청도 같은 202");
      await flush();
      const [after] = await rows(prefix);
      assert.equal(after.consented_at, confirmed.consented_at, "consented_at 불변");
      assert.equal(after.confirmed_at, confirmed.confirmed_at, "confirmed_at 불변");
      assert.equal((await mailsTo(addr)).length, 1, "확인 후 재신청은 메일 없음");
      assert.equal((await c(confirmPost(token))).status, 200, "재신청 후에도 기존 토큰 유효");
    } finally {
      await cleanup(prefix);
    }
  },
});

Deno.test({
  name: "통합: 미만료 중 재신청은 202 동일·메일 없음(기존 링크 유효), 만료 후에만 새 메일·새 토큰",
  ignore: !IT,
  fn: async () => {
    const prefix = `it-${RUN}-cap`;
    const addr = `${prefix}@example.com`;
    try {
      const h = createHandler(deps(100));
      const c = confirmHandler();
      for (let i = 0; i < 3; i++) {
        const r = await h(post(addr));
        assert.equal(r.status, 202);
        await r.body?.cancel();
      }
      await flush();
      const first = await mailsTo(addr);
      assert.equal(first.length, 1, "미만료 중 재신청은 메일 없음");
      assert.equal((await rows(prefix))[0].confirm_sends, 1);

      // 링크 만료 흉내 → 다음 신청에서만 새 토큰 발급
      const res = await fetch(`${IT!.url}/rest/v1/waitlist_signups?email_norm=eq.${encodeURIComponent(addr)}`, {
        method: "PATCH",
        headers: { apikey: IT!.key, authorization: `Bearer ${IT!.key}`, "content-type": "application/json" },
        body: JSON.stringify({ confirm_expires_at: new Date(Date.now() - 1000).toISOString() }),
      });
      assert.equal(res.status, 204);
      assert.equal((await h(post(addr))).status, 202);
      await flush();
      const mails = await mailsTo(addr);
      assert.equal(mails.length, 2, "만료 후 새 메일");
      assert.equal((await rows(prefix))[0].confirm_sends, 2);
      assert.equal((await c(confirmPost(tokenOf(mails[0])))).status, 400, "덮어쓴 이전 토큰은 무효");
      assert.equal((await c(confirmPost(tokenOf(mails[1])))).status, 200);
    } finally {
      await cleanup(prefix);
    }
  },
});
