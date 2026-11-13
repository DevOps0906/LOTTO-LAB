// 로컬 Supabase 통합(task-041 완료 조건): 가입 → 프로필 저장(A-17 PUT) → 시각 있음→모름 덮어쓰기 → 삭제 → GET 0행 → 계정 삭제.
// 기본은 건너뛴다. 실행: `supabase start` 후
//   AUTH_IT=1 VITE_SUPABASE_PUBLISHABLE_KEY=<로컬 publishable 키> pnpm --filter @lotto-lab/mobile exec vitest run test/fortune-profile.integration.test.ts
// 메일 코드는 로컬 Mailpit(54524)에서 읽는다(auth.integration.test.ts와 같은 방식).
import { AuthService, FortuneProfileService } from "@lotto-lab/app-core";
import { describe, expect, it } from "vitest";
import { createSupabaseClients, memoryStorage } from "../src/platform/auth.ts";

const RUN = process.env.AUTH_IT === "1";
const URL_BASE = process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54521";
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const MAIL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54524";
const ALL = { terms: true, privacy: true, adult: true };

type MailList = { messages: { ID: string; Created: string }[] };

async function readCode(email: string, since: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = (await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json()) as MailList;
    const latest = list.messages.find((m) => Date.parse(m.Created) >= since);
    if (latest) {
      const message = (await (await fetch(`${MAIL}/api/v1/message/${latest.ID}`)).json()) as { Text: string; HTML: string };
      const code = /\b([0-9]{6})\b/.exec(message.Text || message.HTML)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("메일 코드를 받지 못했습니다");
}

describe.skipIf(!RUN)("로컬 Supabase 사주 프로필 통합", () => {
  it("저장 → 읽기 → 모름으로 덮어쓰기 → 서버 CHECK 거부 → 삭제 후 GET 0행 → 로그아웃", { timeout: 120_000 }, async () => {
    const clients = createSupabaseClients({ supabaseUrl: URL_BASE, publishableKey: KEY }, memoryStorage());
    const auth = new AuthService(clients.auth);
    const profile = new FortuneProfileService(clients.fortuneProfile);
    await auth.init();
    const email = `it-profile-${Date.now()}@example.com`;
    const password = "abcd1234";

    // 세션 없음: 읽기는 0행(anon 권한 없음 → 401·403 계열 오류도 허용), 쓰기는 SESSION_EXPIRED
    expect(await profile.save({ birth_date: "1990-03-15", calendar: "solar", is_leap_month: false, birth_hour: null }, true)).toMatchObject({ ok: false, code: "SESSION_EXPIRED" });

    const since = Date.now() - 1000;
    expect(await auth.signUp(email, password, ALL)).toMatchObject({ ok: true });
    expect(await auth.verifySignup(email, await readCode(email, since), ALL)).toEqual({ ok: true });
    expect(auth.state().status).toBe("signedIn");

    expect(await profile.load()).toEqual({ ok: true, value: null });

    // 저장 → 읽기(시각 있음)
    expect(await profile.save({ birth_date: "1989-05-30", calendar: "lunar", is_leap_month: true, birth_hour: "myo" }, true)).toMatchObject({ ok: true });
    expect(await profile.load()).toEqual({ ok: true, value: { birth_date: "1989-05-30", calendar: "lunar", is_leap_month: true, birth_hour: "myo" } });

    // 시각 있음 → 모름(null 명시), 윤달 해제·양력으로: 이전 값이 남지 않는다
    expect(await profile.save({ birth_date: "1990-03-15", calendar: "solar", is_leap_month: false, birth_hour: "" }, true)).toMatchObject({ ok: true });
    expect(await profile.load()).toEqual({ ok: true, value: { birth_date: "1990-03-15", calendar: "solar", is_leap_month: false, birth_hour: null } });

    // 범위 밖·없는 날짜는 DB CHECK가 거부 → INVALID_INPUT(생년월일 원문은 결과에 없다), 기존 값 유지
    for (const bad of ["2999-01-01", "1899-12-31", "2023-02-30"]) {
      const out = await profile.save({ birth_date: bad, calendar: "solar", is_leap_month: false, birth_hour: null }, true);
      expect(out).toMatchObject({ ok: false, code: "INVALID_INPUT" });
      expect(JSON.stringify(out)).not.toContain(bad);
    }
    expect(await profile.load()).toMatchObject({ ok: true, value: { birth_date: "1990-03-15" } });

    // 삭제 후 GET 0행
    expect(await profile.remove()).toEqual({ ok: true, value: null });
    expect(await profile.load()).toEqual({ ok: true, value: null });
    // 없는 행 삭제도 성공(멱등)
    expect(await profile.remove()).toEqual({ ok: true, value: null });

    // 로그아웃 후에는 세션이 없어 프로필 호출이 막힌다(계정 삭제 CASCADE 파기는 task-040 DB 테스트·A-20 EF 통합에서 확인)
    await auth.signOut();
    expect(await profile.save({ birth_date: "1990-03-15", calendar: "solar", is_leap_month: false, birth_hour: null }, true)).toMatchObject({ ok: false, code: "SESSION_EXPIRED" });
    expect(await profile.load()).toMatchObject({ ok: false });
  });
});
