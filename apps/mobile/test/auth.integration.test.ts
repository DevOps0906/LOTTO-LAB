// 로컬 Supabase 통합(task-043 완료 조건): 가입 → 메일 코드 → 로그인 → 로그아웃 → 재설정 → 새 비밀번호 로그인 → 계정 삭제 → 로그인 실패.
// 기본은 건너뛴다. 실행: `supabase start`(task-043a 설정 적용) 후
//   AUTH_IT=1 VITE_SUPABASE_PUBLISHABLE_KEY=<로컬 publishable 키> pnpm --filter @lotto-lab/mobile exec vitest run test/auth.integration.test.ts
// 메일 코드는 로컬 메일 서버(Mailpit, config.toml [local_smtp] 54524) API로 읽는다. 같은 주소 메일 간격 60초(max_frequency)를 기다린다.
import { AuthService } from "@lotto-lab/app-core";
import { describe, expect, it } from "vitest";
import { createAuthClient, memoryStorage } from "../src/platform/auth.ts";

const RUN = process.env.AUTH_IT === "1";
const URL_BASE = process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54521";
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const MAIL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54524";
const ALL = { terms: true, privacy: true, adult: true };

type MailList = { messages: { ID: string; Created: string }[] };

/** since 이후 email로 온 최신 메일의 6자리 코드. 메일 본문에 링크가 없는지도 확인한다. */
async function readCode(email: string, since: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = (await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json()) as MailList;
    const latest = list.messages.find((m) => Date.parse(m.Created) >= since);
    if (latest) {
      const message = (await (await fetch(`${MAIL}/api/v1/message/${latest.ID}`)).json()) as { Text: string; HTML: string };
      expect(`${message.Text}${message.HTML}`).not.toMatch(/https?:\/\/[^\s"']*verify/);
      const code = /\b([0-9]{6})\b/.exec(message.Text || message.HTML)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("메일 코드를 받지 못했습니다");
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!RUN)("로컬 Supabase 인증 통합", () => {
  it("가입 → 코드 → 로그인·로그아웃 → 재설정 → 새 비밀번호 로그인 → 계정 삭제 → 로그인 실패", { timeout: 240_000 }, async () => {
    const auth = new AuthService(createAuthClient({ supabaseUrl: URL_BASE, publishableKey: KEY }, memoryStorage()));
    await auth.init();
    const email = `it-${Date.now()}@example.com`;
    const first = "abcd1234";
    const second = "efgh5678";

    let since = Date.now() - 1000;
    expect(await auth.signUp(email, first, ALL)).toMatchObject({ ok: true });
    expect(await auth.signIn(email, first)).toMatchObject({ ok: false, code: "CREDENTIALS" }); // 미확인 = 같은 문구
    expect(await auth.verifySignup(email, await readCode(email, since), ALL)).toEqual({ ok: true });
    expect(auth.state().status).toBe("signedIn");

    await auth.signOut();
    expect(auth.state().status).toBe("signedOut");
    expect(await auth.signIn(email, first)).toEqual({ ok: true });
    await auth.signOut();

    await wait(61_000); // 같은 주소 메일 간격(max_frequency 60s)
    since = Date.now() - 1000;
    expect((await auth.requestReset(email)).ok).toBe(true);
    expect(await auth.confirmReset(email, await readCode(email, since), second)).toEqual({ ok: true });
    await auth.signOut();
    expect(await auth.signIn(email, first)).toMatchObject({ ok: false, code: "CREDENTIALS" });
    expect(await auth.signIn(email, second)).toEqual({ ok: true });

    expect(await auth.deleteAccount("wrong9999")).toMatchObject({ ok: false, code: "REAUTH_REQUIRED" });
    expect(await auth.deleteAccount(second)).toEqual({ ok: true });
    expect(auth.state().status).toBe("signedOut");
    expect(await auth.signIn(email, second)).toMatchObject({ ok: false, code: "CREDENTIALS" });
  });
});
