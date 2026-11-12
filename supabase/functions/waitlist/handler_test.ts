// 오프라인 단위 테스트: npx deno test supabase/functions/waitlist/ (네트워크·DB 없이 가짜 deps)
import assert from "node:assert/strict";
import { CONFIRM_MAX_SENDS, CONFIRM_TTL_SEC, CONFIRM_WINDOW_SEC, createHandler, type Deps, isValidEmail } from "./handler.ts";
import { clientIp, normalizeIp } from "../_shared/ip.ts";
import { sha256Hex } from "../_shared/http.ts";
import type { MailMessage } from "../_shared/mailer.ts";
import { type TurnstileResult, verifyTurnstile } from "./turnstile.ts";

const ORIGIN = "https://lotto-lab.example";
const ENV = {
  SUPABASE_URL: "http://db.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  TURNSTILE_SECRET: "test-turnstile-secret",
  TURNSTILE_HOSTNAMES: "lotto-lab.example",
  RATE_SALT: "test-salt",
  ALLOWED_ORIGIN: ORIGIN,
  MAIL_API_URL: "https://mail.test/api/v1/send",
  MAIL_API_KEY: "test-mail-key",
  MAIL_FROM: "noreply@lotto-lab.example",
  CONFIRM_BASE_URL: "https://lotto-lab.example/",
};

interface Fake {
  deps: Deps;
  emails: Set<string>;
  hits: Map<string, number>;
  requests: { email: string; tokenHash: string; o: { ttlSec: number; maxSends: number; windowSec: number } }[];
  mails: MailMessage[];
  waited: Promise<unknown>[];
}

type FakeOpts = {
  turnstile: TurnstileResult;
  rateThrows: boolean;
  confirmThrows: boolean;
  send: boolean; // requestConfirm 결과(false = 이미 확인·이메일별 한도 초과)
  mailThrows: boolean;
  env: Record<string, string | undefined>;
};

function fake(over: Partial<FakeOpts> = {}): Fake {
  const f: Fake = {
    emails: new Set(),
    hits: new Map(),
    requests: [],
    mails: [],
    waited: [],
    deps: {
      env: over.env ?? ENV,
      verifyTurnstile: () => Promise.resolve(over.turnstile ?? "ok"),
      rateHit: (_cfg, key, _w, max) => {
        if (over.rateThrows) return Promise.reject(new Error("db down"));
        const n = (f.hits.get(key) ?? 0) + 1;
        f.hits.set(key, n);
        return Promise.resolve(n <= max);
      },
      requestConfirm: (_cfg, email, tokenHash, o) => {
        if (over.confirmThrows) return Promise.reject(new Error("rpc failed"));
        f.requests.push({ email, tokenHash, o });
        f.emails.add(email.trim().toLowerCase()); // ON CONFLICT(email_norm) 흉내
        return Promise.resolve(over.send ?? true);
      },
      sendMail: (_cfg, msg) => {
        if (over.mailThrows) return Promise.reject(new Error("mail down"));
        f.mails.push(msg);
        return Promise.resolve();
      },
      waitUntil: (p) => {
        f.waited.push(p);
      },
    },
  };
  return f;
}

const VALID = { email: "user@example.com", consent_marketing: true, age_confirmed: true, turnstile_token: "tok" };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://fn.test/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function code(res: Response): Promise<string> {
  return (await res.json()).error.code;
}

Deno.test("OPTIONS → 204 + CORS(ALLOWED_ORIGIN만)", async () => {
  const res = await createHandler(fake().deps)(new Request("http://fn.test/waitlist", { method: "OPTIONS" }));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(res.headers.get("access-control-allow-methods"), "POST, OPTIONS");
});

Deno.test("POST 외 메서드 → 405", async () => {
  const res = await createHandler(fake().deps)(new Request("http://fn.test/waitlist", { method: "GET" }));
  assert.equal(res.status, 405);
  assert.equal(await code(res), "METHOD_NOT_ALLOWED");
});

Deno.test("필수 env 누락 → 500, 외부 호출 없음", async () => {
  for (const k of Object.keys(ENV)) {
    const f = fake({ env: { ...ENV, [k]: undefined } });
    const res = await createHandler(f.deps)(post(VALID));
    assert.equal(res.status, 500, k);
    assert.equal(f.hits.size, 0);
  }
});

Deno.test("신규·중복 이메일 모두 202 빈 본문", async () => {
  const f = fake();
  const h = createHandler(f.deps);
  const r1 = await h(post(VALID));
  const r2 = await h(post({ ...VALID, email: "  USER@example.com " }));
  assert.equal(r1.status, 202);
  assert.equal(r2.status, 202);
  assert.equal(await r1.text(), "");
  assert.equal(await r2.text(), "");
  assert.equal(r1.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(f.emails.size, 1);
});

Deno.test("입력 오류 → 400 INVALID_INPUT, 레이트리밋 전 차단", async () => {
  const bad: unknown[] = [
    "{not json",
    [],
    { ...VALID, email: "no-at-sign" },
    { ...VALID, email: "a".repeat(250) + "@x.com" },
    { ...VALID, consent_marketing: false },
    { ...VALID, age_confirmed: "true" },
    { ...VALID, turnstile_token: "" },
    { email: VALID.email, consent_marketing: true, age_confirmed: true },
  ];
  for (const b of bad) {
    const f = fake();
    const res = await createHandler(f.deps)(post(b));
    assert.equal(res.status, 400, JSON.stringify(b));
    assert.equal(await code(res), "INVALID_INPUT");
    assert.equal(f.hits.size, 0);
  }
});

Deno.test("isValidEmail: 반례 거부·정상 허용", () => {
  const bad = [
    ".a@example.com", "a.@example.com", "a..b@example.com", "a@example..com", "a@-x.com", "a@x-.com",
    "a@.example.com", "a@example.com.", "a@example.c", "a@example", "a@b@example.com", "@example.com",
    "a b@example.com", "a@exa_mple.com", "a@example.c0m",
    "x".repeat(65) + "@example.com", "a@" + "b".repeat(64) + ".com",
    "a".repeat(7) + "@" + ("b".repeat(60) + ".").repeat(4) + "com", // 255바이트
    "가".repeat(22) + "@example.com", // 로컬 66바이트(UTF-8)
  ];
  for (const e of bad) assert.equal(isValidEmail(e), false, e);
  const ok = [
    "user@example.com", "first.last+tag@sub.example.co.kr", "a_b-c@x-y.io", "A@EXAMPLE.COM",
    "x".repeat(64) + "@example.com", "u@xn--3e0b707e.xn--3e0b707e", "가나@example.com",
    "a".repeat(6) + "@" + ("b".repeat(60) + ".").repeat(4) + "com", // 254바이트
  ];
  for (const e of ok) assert.equal(isValidEmail(e), true, e);
});

function streamPost(chunks: Uint8Array[], hang = false) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      if (!hang) c.close();
    },
  });
  return new Request("http://fn.test/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body,
  });
}

Deno.test("Content-Length 없는 4096바이트 초과 본문 → 400, 레이트리밋 전 차단", async () => {
  const f = fake();
  const big = new TextEncoder().encode(JSON.stringify({ ...VALID, pad: "x".repeat(5000) }));
  const req = streamPost([big.slice(0, 3000), big.slice(3000)]);
  assert.equal(req.headers.get("content-length"), null);
  const res = await createHandler(f.deps)(req);
  assert.equal(res.status, 400);
  assert.equal(await code(res), "INVALID_INPUT");
  assert.equal(f.hits.size, 0);
});

Deno.test("Content-Length 없는 정상 스트림 본문 → 202", async () => {
  const res = await createHandler(fake().deps)(streamPost([new TextEncoder().encode(JSON.stringify(VALID))]));
  assert.equal(res.status, 202);
});

Deno.test("본문 수신 지연 → 시간 제한 후 400", async () => {
  const f = fake();
  f.deps.bodyTimeoutMs = 30;
  const res = await createHandler(f.deps)(streamPost([new TextEncoder().encode('{"email":')], true));
  assert.equal(res.status, 400);
  assert.equal(f.hits.size, 0);
});

Deno.test("IP를 못 구하면 공통 키로 제한", async () => {
  const f = fake();
  const h = createHandler(f.deps);
  const noIp = () =>
    new Request("http://fn.test/waitlist", { method: "POST", body: JSON.stringify(VALID) });
  for (let i = 0; i < 5; i++) assert.equal((await h(noIp())).status, 202);
  assert.equal((await h(noIp())).status, 429);
  assert.equal(f.hits.size, 1);
});

Deno.test("Turnstile 거부 → 400 INVALID_INPUT, RPC 없음", async () => {
  const f = fake({ turnstile: "rejected" });
  const res = await createHandler(f.deps)(post(VALID));
  assert.equal(res.status, 400);
  assert.equal(await code(res), "INVALID_INPUT");
  assert.equal(f.requests.length, 0);
});

Deno.test("Turnstile 장애 → 503", async () => {
  const f = fake({ turnstile: "unavailable" });
  const res = await createHandler(f.deps)(post(VALID));
  assert.equal(res.status, 503);
  assert.equal(await code(res), "SERVICE_UNAVAILABLE");
  assert.equal(f.requests.length, 0);
});

Deno.test("확인 요청 RPC 오류 → 503, 메일 없음", async () => {
  const f = fake({ confirmThrows: true });
  const res = await createHandler(f.deps)(post(VALID));
  assert.equal(res.status, 503);
  assert.equal(f.waited.length, 0);
});

Deno.test("확인 메일: RPC true → 202 후 waitUntil로 발송, 링크 토큰의 sha256 = 저장 해시", async () => {
  const f = fake();
  const res = await createHandler(f.deps)(post({ ...VALID, email: " user@example.com " }));
  assert.equal(res.status, 202);
  assert.equal(await res.text(), "");
  assert.equal(f.waited.length, 1);
  await Promise.all(f.waited);
  assert.equal(f.mails.length, 1);
  const [m] = f.mails;
  const [req] = f.requests;
  assert.equal(m.to, "user@example.com");
  assert.deepEqual(req.o, { ttlSec: CONFIRM_TTL_SEC, maxSends: CONFIRM_MAX_SENDS, windowSec: CONFIRM_WINDOW_SEC });
  const token = m.text.match(/https:\/\/lotto-lab\.example\/waitlist\/confirm#token=([A-Za-z0-9_-]{43})(?:\s|$)/)?.[1];
  assert.ok(token, "프래그먼트 링크·43자 base64url 토큰");
  assert.equal(req.tokenHash, await sha256Hex(token));
  assert.ok(!m.text.includes("?token="), "쿼리스트링 토큰 금지");
  assert.ok(m.text.includes("요청하지 않았다면") && m.text.includes("24시간 후 자동 삭제"));
  assert.ok(m.text.includes("만 19세 이상"));
  assert.ok(m.html.includes('href="https://lotto-lab.example/waitlist/confirm#token='));
});

Deno.test("확인 메일: 요청마다 새 토큰", async () => {
  const f = fake();
  const h = createHandler(f.deps);
  await h(post(VALID));
  await h(post(VALID));
  assert.notEqual(f.requests[0].tokenHash, f.requests[1].tokenHash);
});

Deno.test("확인 메일: RPC false(이미 확인·이메일별 한도) → 같은 202, 발송 없음", async () => {
  const f = fake({ send: false });
  const res = await createHandler(f.deps)(post(VALID));
  assert.equal(res.status, 202);
  assert.equal(await res.text(), "");
  assert.equal(f.waited.length, 0);
  assert.equal(f.mails.length, 0);
});

Deno.test("확인 메일: 발송 실패도 202(사유 코드만 로그, 거부 없음)", async () => {
  const f = fake({ mailThrows: true });
  const res = await createHandler(f.deps)(post(VALID));
  assert.equal(res.status, 202);
  await Promise.all(f.waited); // catch 처리되어 reject되지 않는다
});

Deno.test("waitUntil 미지원 런타임 → 500, DB 접근 없음", async () => {
  const f = fake();
  delete f.deps.waitUntil;
  const res = await createHandler(f.deps)(post(VALID));
  assert.equal(res.status, 500);
  assert.equal(await code(res), "INTERNAL");
  assert.equal(f.hits.size, 0);
  assert.equal(f.requests.length, 0);
});

Deno.test("메일 env 형식 오류 → 500(fail-closed)", async () => {
  for (const [k, v] of [["MAIL_API_URL", "not a url"], ["CONFIRM_BASE_URL", "ftp://x.example"], ["MAIL_FROM", "nobody"]]) {
    const f = fake({ env: { ...ENV, [k]: v } });
    const res = await createHandler(f.deps)(post(VALID));
    assert.equal(res.status, 500, k);
    assert.equal(f.hits.size, 0);
  }
});

Deno.test("레이트리밋 함수 오류 → 503", async () => {
  const res = await createHandler(fake({ rateThrows: true }).deps)(post(VALID));
  assert.equal(res.status, 503);
});

Deno.test("같은 IP 6번째 → 429 + Retry-After", async () => {
  const h = createHandler(fake().deps);
  for (let i = 0; i < 5; i++) assert.equal((await h(post(VALID))).status, 202);
  const res = await h(post(VALID));
  assert.equal(res.status, 429);
  assert.equal(await code(res), "RATE_LIMITED");
  assert.equal(res.headers.get("retry-after"), "600");
  assert.equal(res.headers.get("access-control-expose-headers"), "Retry-After");
});

Deno.test("WAITLIST_RATE_MAX env로 한도 조정", async () => {
  const h = createHandler(fake({ env: { ...ENV, WAITLIST_RATE_MAX: "2" } }).deps);
  assert.equal((await h(post(VALID))).status, 202);
  assert.equal((await h(post(VALID))).status, 202);
  assert.equal((await h(post(VALID))).status, 429);
});

Deno.test("위조 X-Forwarded-For 맨 왼쪽 값으로 키 회피 불가", async () => {
  const f = fake();
  const h = createHandler(f.deps);
  for (let i = 0; i < 5; i++) {
    const res = await h(post(VALID, { "x-forwarded-for": `10.0.0.${i}, 198.51.100.${i}, 203.0.113.7` }));
    assert.equal(res.status, 202);
  }
  const res = await h(post(VALID, { "x-forwarded-for": "1.1.1.1, 203.0.113.7" }));
  assert.equal(res.status, 429);
  assert.equal(f.hits.size, 1);
});

Deno.test("같은 /64 IPv6는 같은 키", async () => {
  const f = fake();
  const h = createHandler(f.deps);
  await h(post(VALID, { "x-forwarded-for": "2001:db8:1:2::1" }));
  await h(post(VALID, { "x-forwarded-for": "2001:db8:1:2:ffff:eeee:dddd:cccc" }));
  await h(post(VALID, { "x-forwarded-for": "2001:db8:1:3::1" }));
  assert.equal(f.hits.size, 2);
});

Deno.test("clientIp: 우선 헤더 → XFF 맨 오른쪽", () => {
  assert.equal(clientIp(new Headers({ "x-real-ip": "192.0.2.1", "x-forwarded-for": "9.9.9.9" })), "192.0.2.1");
  // 로컬 Kong은 cf-connecting-ip를 덮어쓰지 않으므로 무시한다
  assert.equal(clientIp(new Headers({ "cf-connecting-ip": "7.7.7.7", "x-forwarded-for": "6.6.6.6, 192.0.2.3" })), "192.0.2.3");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 192.0.2.2" })), "192.0.2.2");
  assert.equal(clientIp(new Headers()), null);
});

Deno.test("normalizeIp", () => {
  assert.equal(normalizeIp("192.0.2.1"), "192.0.2.1");
  assert.equal(normalizeIp("192.0.2.1:5555"), "192.0.2.1");
  assert.equal(normalizeIp("::ffff:192.0.2.1"), "192.0.2.1");
  assert.equal(normalizeIp("[2001:DB8::1]:443"), "2001:db8:0:0::/64");
  assert.equal(normalizeIp("2001:db8:a:b:c:d:e:f"), "2001:db8:a:b::/64");
  assert.equal(normalizeIp("fe80::1%eth0"), "fe80:0:0:0::/64");
  assert.equal(normalizeIp("::1"), "0:0:0:0::/64");
  assert.equal(normalizeIp("not-an-ip"), null);
  assert.equal(normalizeIp("1:2:3"), null);
  assert.equal(normalizeIp("256.1.1.1"), null);
});

function fakeFetch(fn: () => Promise<Response>): typeof fetch {
  return (() => fn()) as typeof fetch;
}
const json = (o: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(o), { status }));
const base = { secret: "s", hostnames: ["lotto-lab.example"], token: "t", remoteIp: null };

Deno.test("verifyTurnstile: success + 허용 hostname만 ok", async () => {
  assert.equal(await verifyTurnstile({ ...base, fetchFn: fakeFetch(() => json({ success: true, hostname: "lotto-lab.example" })) }), "ok");
  assert.equal(await verifyTurnstile({ ...base, fetchFn: fakeFetch(() => json({ success: true, hostname: "evil.example" })) }), "rejected");
  assert.equal(await verifyTurnstile({ ...base, fetchFn: fakeFetch(() => json({ success: false, "error-codes": ["invalid-input-response"] })) }), "rejected");
});

Deno.test("verifyTurnstile: 장애·타임아웃 → unavailable", async () => {
  assert.equal(await verifyTurnstile({ ...base, fetchFn: fakeFetch(() => json({}, 502)) }), "unavailable");
  assert.equal(await verifyTurnstile({ ...base, fetchFn: fakeFetch(() => json({ success: false, "error-codes": ["internal-error"] })) }), "unavailable");
  assert.equal(await verifyTurnstile({ ...base, fetchFn: fakeFetch(() => Promise.reject(new TypeError("network"))) }), "unavailable");
  const hang: typeof fetch = ((_u: unknown, init?: RequestInit) =>
    new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as typeof fetch;
  assert.equal(await verifyTurnstile({ ...base, fetchFn: hang, timeoutMs: 20 }), "unavailable");
});
