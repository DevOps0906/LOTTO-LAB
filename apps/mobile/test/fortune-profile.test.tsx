// 사주 프로필·사주 번호 연결(task-041): 비로그인 진입 차단·M-06 유도·복귀, 로그인 후 M-18 저장 → M-19 생성(saju·generated),
// M-17 사주 링크, 생년월일은 로컬 저장소·로그에 없음, 셸 클라이언트의 5열 upsert·오류 코드 변환(detail 폐기).
import {
  createAppCore,
  type Adapters,
  type AuthClient,
  type FortuneProfileClient,
  type FortuneProfileResult,
  type FortuneProfileRow,
  type KeyValueStore,
} from "@lotto-lab/app-core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { AUTH_RETURN_PATHS } from "../src/routes.ts";
import type { CoreState } from "../src/core.ts";
import { createFortuneProfileClient } from "../src/platform/auth.ts";

const DATE = "1990-03-15";
const USER = { id: "user-1", email: "a@example.com" };

function memoryStore(map: Map<string, string>): KeyValueStore {
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
    delete: async (key) => void map.delete(key),
    keys: async (prefix) => [...map.keys()].filter((k) => k.startsWith(prefix)),
    flush: async () => {},
  };
}

function fakeAuth(initialUser: typeof USER | null) {
  let user = initialUser;
  const listeners = new Set<(u: typeof USER | null) => void>();
  const client = {
    getUser: async () => user,
    onChange: (l: (u: typeof USER | null) => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    hasConsent: async () => true,
    signOut: async () => {},
    clearLocalSession: async () => {},
  } as unknown as AuthClient;
  return { client, signOut: () => ((user = null), listeners.forEach((l) => l(null))) };
}

function fakeProfileClient(initial: FortuneProfileRow | null = null) {
  let row = initial;
  const client = {
    get: vi.fn(async (): Promise<FortuneProfileResult<FortuneProfileRow | null>> => ({ ok: true, value: row })),
    upsert: vi.fn(async (next: FortuneProfileRow): Promise<FortuneProfileResult<null>> => ((row = next), { ok: true, value: null })),
    delete: vi.fn(async (): Promise<FortuneProfileResult<null>> => ((row = null), { ok: true, value: null })),
  } satisfies FortuneProfileClient;
  return client;
}

function setup(user: typeof USER | null, profile = fakeProfileClient()) {
  const map = new Map<string, string>();
  map.set("ll:v1:settings:app", JSON.stringify({ v: 1, age_confirmed_at: "2026-11-12T03:00:00.000Z" }));
  const auth = fakeAuth(user);
  const adapters: Adapters = {
    store: memoryStore(map),
    clock: { now: () => new Date("2026-11-12T03:00:00.000Z") },
    random: { fill: (b) => crypto.getRandomValues(b as Uint32Array<ArrayBuffer>) },
    fetch: vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
    clipboard: { writeText: async () => {} },
    share: { share: async () => {} },
    openExternal: { open: async () => {} },
    auth: auth.client,
    fortuneProfile: profile,
  };
  const state: CoreState = {
    core: createAppCore(adapters, { supabaseUrl: "http://127.0.0.1:54521", publishableKey: "sb_publishable_test" }, { authReturnPaths: AUTH_RETURN_PATHS }),
    configError: false,
  };
  void state.core!.auth!.init(); // main.tsx와 같다
  return { state, map, profile, auth };
}

const hash = () => window.location.hash;
afterEach(() => {
  window.location.hash = "";
  vi.restoreAllMocks();
});

describe("사주 프로필·번호 연결", () => {
  it("라우트·로그인 복귀 허용 경로에 /fortune/profile·/fortune/saju가 있다", () => {
    expect(AUTH_RETURN_PATHS).toEqual(expect.arrayContaining(["/fortune/profile", "/fortune/saju"]));
  });

  it("M-17의 사주 번호(회원) 링크는 M-19로 간다", async () => {
    const { state } = setup(USER);
    window.location.hash = "#/generate/theme";
    render(<App core={state} />);
    expect(await screen.findByRole("link", { name: "사주 번호(회원)" })).toHaveAttribute("href", "#/fortune/saju");
  });

  it.each(["#/fortune/profile", "#/fortune/saju"])("비로그인 %s: 진입 차단 → 로그인·가입 → M-06, 프로필 요청 없음", async (target) => {
    const { state, profile } = setup(null);
    window.location.hash = target;
    render(<App core={state} />);
    expect(await screen.findByText("로그인이 필요해요")).toBeInTheDocument();
    expect(screen.queryByLabelText("생년월일(필수)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "로그인·가입" }));
    expect(hash()).toBe("#/login");
    expect(state.core!.auth!.returnTo.take()).toBe(target.slice(1)); // 로그인 뒤 원래 화면으로
    expect(profile.get).not.toHaveBeenCalled();
  });

  it("로그인 상태: M-18 저장(5열·시각 모름 null) → M-19 이동 → 사주 번호 생성(generated·saju), 생년월일은 로컬 저장소·fetch에 없음", async () => {
    const { state, map, profile } = setup(USER);
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error"), vi.spyOn(console, "info")];
    window.location.hash = "#/fortune/profile";
    render(<App core={state} />);
    fireEvent.change(await screen.findByLabelText("생년월일(필수)"), { target: { value: DATE } });
    fireEvent.click(screen.getByRole("checkbox", { name: /개인정보 수집·이용에 동의/ }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(hash()).toBe("#/fortune/saju"));
    expect(profile.upsert).toHaveBeenCalledWith({ birth_date: DATE, calendar: "solar", is_leap_month: false, birth_hour: null });

    expect(await screen.findByText(`${DATE} (양력)`)).toBeInTheDocument();
    const fetchesBefore = (state.core!.adapters.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    const generate = async () => {
      fireEvent.click(screen.getByRole("button", { name: "오늘의 번호 생성" }));
      await screen.findByText(/사주 출처/);
    };
    await generate();
    expect(screen.getByText(/사주 출처/)).toHaveTextContent("사주 출처 사주 · 생성 이력에 저장됨");
    const first = screen.getByRole("list", { name: "1게임 번호" }).textContent;
    await generate(); // 같은 날 같은 결과
    expect(screen.getByRole("list", { name: "1게임 번호" }).textContent).toBe(first);

    await waitFor(() => expect([...map.keys()].filter((k) => k.startsWith("ll:v1:generated:"))).toHaveLength(10));
    const generated = [...map.entries()].filter(([k]) => k.startsWith("ll:v1:generated:")).map(([, v]) => JSON.parse(v));
    expect(generated.every((g) => g.method === "saju" && g.game === "lotto")).toBe(true);
    expect([...map.values()].some((v) => v.includes(DATE))).toBe(false);
    expect((state.core!.adapters.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchesBefore);
    for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain(DATE);
  });

  it("M-19 화면에서 로그아웃(세션 소멸)되면 프로필·결과가 비워지고 차단 화면이 된다", async () => {
    const { state, auth } = setup(USER, fakeProfileClient({ birth_date: DATE, calendar: "solar", is_leap_month: false, birth_hour: "o" }));
    window.location.hash = "#/fortune/saju";
    render(<App core={state} />);
    expect(await screen.findByText(`${DATE} (양력)`)).toBeInTheDocument();
    await act(async () => {
      await state.core!.auth!.signOut();
      auth.signOut();
    });
    expect(screen.queryByText(`${DATE} (양력)`)).not.toBeInTheDocument();
    expect(screen.getByText("로그인이 필요해요")).toBeInTheDocument();
  });
});

describe("셸 FortuneProfileClient(Supabase)", () => {
  type Call = { table: string; op: string; arg?: unknown; opts?: unknown; eq?: [string, string] };
  function fakeSupabase(result: { data?: unknown; error?: { code?: string; message?: string; details?: string } | null; status?: number }, session: { user: { id: string } } | null = { user: { id: "u-1" } }) {
    const calls: Call[] = [];
    const settle = () => Promise.resolve({ data: result.data ?? [], error: result.error ?? null, status: result.status ?? 200 });
    const builder = (op: string, arg?: unknown, opts?: unknown) => {
      const call: Call = { table: "fortune_profiles", op, arg, opts };
      calls.push(call);
      const chain = {
        limit: () => settle(),
        eq: (col: string, val: string) => ((call.eq = [col, val]), settle()),
        then: (resolve: (v: unknown) => unknown) => settle().then(resolve),
      };
      return chain;
    };
    const supabase = {
      auth: { getSession: async () => ({ data: { session } }) },
      from: (table: string) => ({
        select: (cols: string) => builder("select", cols),
        upsert: (row: unknown, opts: unknown) => builder("upsert", row, opts),
        delete: () => builder("delete"),
        __table: table,
      }),
    };
    return { calls, client: createFortuneProfileClient(supabase as never) };
  }

  it("upsert는 세션 uid와 5열(birth_hour null 포함)을 보낸다", async () => {
    const { calls, client } = fakeSupabase({});
    expect(await client.upsert({ birth_date: DATE, calendar: "solar", is_leap_month: false, birth_hour: null })).toEqual({ ok: true, value: null });
    expect(calls[0]).toMatchObject({
      op: "upsert",
      arg: { user_id: "u-1", birth_date: DATE, calendar: "solar", is_leap_month: false, birth_hour: null },
      opts: { onConflict: "user_id" },
    });
    expect(Object.keys(calls[0]!.arg as object).sort()).toEqual(["birth_date", "birth_hour", "calendar", "is_leap_month", "user_id"]);
  });

  it("세션이 없으면 401(서버 호출 없음)", async () => {
    const { calls, client } = fakeSupabase({}, null);
    expect(await client.upsert({ birth_date: DATE, calendar: "solar", is_leap_month: false, birth_hour: null })).toEqual({ ok: false, failure: { code: null, status: 401 } });
    expect(await client.delete()).toEqual({ ok: false, failure: { code: null, status: 401 } });
    expect(calls).toHaveLength(0);
  });

  it("오류는 code·status만 옮기고 message·details(생년월일 포함 가능)는 버린다, status 0은 network", async () => {
    const leaky = { code: "23514", message: `new row violates check constraint`, details: `Failing row contains (${DATE})` };
    const { client } = fakeSupabase({ error: leaky, status: 400 });
    const out = await client.upsert({ birth_date: DATE, calendar: "solar", is_leap_month: false, birth_hour: null });
    expect(out).toEqual({ ok: false, failure: { code: "23514", status: 400 } });
    expect(JSON.stringify(out)).not.toContain("1990");
    const offline = fakeSupabase({ error: { message: "fetch failed" }, status: 0 });
    expect(await offline.client.get()).toEqual({ ok: false, failure: { code: null, status: 0, network: true } });
  });

  it("get은 0행이면 null, delete는 본인 user_id로 지운다", async () => {
    const empty = fakeSupabase({ data: [] });
    expect(await empty.client.get()).toEqual({ ok: true, value: null });
    expect(empty.calls[0]).toMatchObject({ op: "select", arg: "birth_date,calendar,is_leap_month,birth_hour" });
    const row = { birth_date: DATE, calendar: "solar", is_leap_month: false, birth_hour: "o" };
    expect(await fakeSupabase({ data: [row] }).client.get()).toEqual({ ok: true, value: row });
    const del = fakeSupabase({});
    expect(await del.client.delete()).toEqual({ ok: true, value: null });
    expect(del.calls[0]).toMatchObject({ op: "delete", eq: ["user_id", "u-1"] });
  });
});
