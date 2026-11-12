// 오프라인 단위 테스트: 메일 설정 fail-closed · Mailpit 송신 API 요청 형식
import assert from "node:assert/strict";
import { confirmLink, confirmMail, loadMailConfig, MAIL_ENV, sendMail } from "./mailer.ts";

const ENV = {
  MAIL_API_URL: "https://mail.test/api/v1/send",
  MAIL_API_KEY: "k",
  MAIL_FROM: "noreply@lotto-lab.example",
  CONFIRM_BASE_URL: "https://lotto-lab.example/",
};

Deno.test("loadMailConfig: 필수 4개 중 하나라도 없으면 null", () => {
  for (const k of MAIL_ENV) assert.equal(loadMailConfig({ ...ENV, [k]: " " }), null, k);
  assert.equal(loadMailConfig(ENV)?.confirmBaseUrl, "https://lotto-lab.example");
});

Deno.test("loadMailConfig: https만, http는 로컬·도커 내부 호스트만", () => {
  const ok = [
    "http://localhost:54524/api/v1/send",
    "http://127.0.0.1:54524/api/v1/send",
    "http://host.docker.internal:54524/api/v1/send",
    "http://supabase_inbucket_LOTTO-LAB:8025/api/v1/send",
  ];
  for (const u of ok) assert.ok(loadMailConfig({ ...ENV, MAIL_API_URL: u }), u);
  for (const u of ["http://mail.example.com/send", "ftp://mail.example.com", "not a url"]) {
    assert.equal(loadMailConfig({ ...ENV, MAIL_API_URL: u }), null, u);
  }
  assert.ok(loadMailConfig({ ...ENV, CONFIRM_BASE_URL: "http://localhost:3000" }));
  assert.equal(loadMailConfig({ ...ENV, CONFIRM_BASE_URL: "http://lotto-lab.example" }), null);
});

Deno.test("loadMailConfig: CONFIRM_BASE_URL 사용자 정보·쿼리·프래그먼트·경로 거부, origin으로 링크", () => {
  for (const u of [
    "https://user:pw@lotto-lab.example",
    "https://evil.example@lotto-lab.example",
    "https://lotto-lab.example/?x=1",
    "https://lotto-lab.example/?",
    "https://lotto-lab.example/#a",
    "https://lotto-lab.example/app",
    "https://lotto-lab.example//",
  ]) assert.equal(loadMailConfig({ ...ENV, CONFIRM_BASE_URL: u }), null, u);
  const cfg = loadMailConfig({ ...ENV, CONFIRM_BASE_URL: "HTTPS://Lotto-Lab.example:443" })!;
  assert.equal(cfg.confirmBaseUrl, "https://lotto-lab.example");
  assert.equal(confirmLink(cfg, "t"), "https://lotto-lab.example/waitlist/confirm#token=t");
});

Deno.test("sendMail: Mailpit 형식 + Bearer, 비정상 응답은 예외", async () => {
  const cfg = loadMailConfig(ENV)!;
  let seen: { url: string; init: RequestInit } | null = null;
  const ok: typeof fetch = (url, init) => {
    seen = { url: String(url), init: init! };
    return Promise.resolve(new Response('{"ID":"x"}', { status: 200 }));
  };
  await sendMail(cfg, confirmMail(cfg, "u@example.com", "T".repeat(43)), ok);
  assert.equal(seen!.url, ENV.MAIL_API_URL);
  assert.equal((seen!.init.headers as Record<string, string>).authorization, "Bearer k");
  const body = JSON.parse(String(seen!.init.body));
  assert.deepEqual(body.To, [{ Email: "u@example.com" }]);
  assert.equal(body.From.Email, ENV.MAIL_FROM);
  assert.ok(body.Text.includes(`https://lotto-lab.example/waitlist/confirm#token=${"T".repeat(43)}`));
  const bad: typeof fetch = () => Promise.resolve(new Response("no", { status: 401 }));
  await assert.rejects(sendMail(cfg, confirmMail(cfg, "u@example.com", "t"), bad), /mail_http_401/);
});
