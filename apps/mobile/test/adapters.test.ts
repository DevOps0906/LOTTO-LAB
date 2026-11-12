// 어댑터 계약: app-core 인터페이스(adapters.ts)대로 Capacitor 플러그인을 부르는지 확인한다(플러그인은 메모리 대역).
import { AppCoreError } from "@lotto-lab/app-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prefs = new Map<string, string>();
const calls = vi.hoisted(() => ({ clipboard: vi.fn(), share: vi.fn(), browser: vi.fn() }));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: prefs.has(key) ? prefs.get(key)! : null }),
    set: async ({ key, value }: { key: string; value: string }) => void prefs.set(key, value),
    remove: async ({ key }: { key: string }) => void prefs.delete(key),
    keys: async () => ({ keys: [...prefs.keys()] }),
  },
}));
vi.mock("@capacitor/clipboard", () => ({ Clipboard: { write: calls.clipboard } }));
vi.mock("@capacitor/share", () => ({ Share: { share: calls.share } }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: calls.browser } }));

const { createAdapters } = await import("../src/platform/index.ts");
const { bootstrap } = await import("../src/core.ts");
const { readAppConfig, LOCAL_SUPABASE_URL } = await import("../src/config.ts");

beforeEach(() => {
  prefs.clear();
  vi.clearAllMocks();
});

describe("KeyValueStore(Preferences)", () => {
  it("get·set·delete·keys(prefix)·flush 계약", async () => {
    const { store } = createAdapters();
    expect(await store.get("a")).toBeNull();
    await store.set("ll:t:1", "1");
    await store.set("ll:t:2", "2");
    await store.set("other", "x");
    expect(await store.get("ll:t:1")).toBe("1");
    expect((await store.keys("ll:t:")).sort()).toEqual(["ll:t:1", "ll:t:2"]);
    await store.delete("ll:t:1");
    expect(await store.get("ll:t:1")).toBeNull();
    await expect(store.flush()).resolves.toBeUndefined();
  });
});

describe("클립보드·공유·외부 링크", () => {
  it("플러그인에 그대로 넘긴다", async () => {
    const adapters = createAdapters();
    await adapters.clipboard.writeText("1 2 3 4 5 6");
    expect(calls.clipboard).toHaveBeenCalledWith({ string: "1 2 3 4 5 6" });
    await adapters.share.share({ title: "번호", text: "1 2 3" });
    expect(calls.share).toHaveBeenCalledWith({ title: "번호", text: "1 2 3", url: undefined });
    await adapters.openExternal.open("https://example.com/a");
    expect(calls.browser).toHaveBeenCalledWith({ url: "https://example.com/a" });
  });

  it("외부 링크는 http·https만 연다", async () => {
    const { openExternal } = createAdapters();
    for (const url of ["javascript:alert(1)", "file:///etc/hosts", "intent://x", "not a url"]) {
      await expect(openExternal.open(url)).rejects.toBeInstanceOf(AppCoreError);
    }
    expect(calls.browser).not.toHaveBeenCalled();
  });
});

describe("난수·시계", () => {
  it("받은 배열을 암호학적 난수로 채운다", () => {
    const { random, clock } = createAdapters();
    const buffer = new Uint32Array(16);
    random.fill(buffer);
    expect(buffer.some((v) => v !== 0)).toBe(true);
    expect(clock.now()).toBeInstanceOf(Date);
  });
});

describe("설정·app-core 연결", () => {
  it("환경변수가 없으면 로컬 개발 주소, 키는 빈 값이라 core 없이 시작한다", () => {
    const config = readAppConfig({});
    expect(config.supabaseUrl).toBe(LOCAL_SUPABASE_URL);
    expect(bootstrap(createAdapters(), config)).toEqual({ core: null, configError: true });
  });

  it("운영(PROD) 빌드는 로컬 주소로 대체하지 않는다 — URL·키 없으면 INVALID_CONFIG", () => {
    const config = readAppConfig({ PROD: true, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" });
    expect(config.supabaseUrl).toBe("");
    expect(bootstrap(createAdapters(), config).configError).toBe(true);
  });

  it("서버 키(sb_secret_)는 거부한다", () => {
    const config = readAppConfig({ VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" });
    expect(bootstrap(createAdapters(), config).configError).toBe(true);
  });

  it("publishable 키가 있으면 core를 만든다", () => {
    const config = readAppConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" });
    const state = bootstrap(createAdapters(), config);
    expect(state.configError).toBe(false);
    expect(state.core?.adapters.store).toBeDefined();
  });
});
