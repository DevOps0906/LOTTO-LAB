// 어댑터 계약: app-core 인터페이스(adapters.ts)대로 Tauri 플러그인을 부르는지 확인한다(플러그인은 메모리 대역).
import { AppCoreError } from "@lotto-lab/app-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ writeText: vi.fn(), openUrl: vi.fn(), getStore: vi.fn(), save: vi.fn() }));
let storeReady = true;
const data = new Map<string, unknown>();

vi.mock("@tauri-apps/plugin-store", () => ({
  getStore: async (...args: unknown[]) => {
    calls.getStore(...args);
    if (!storeReady) return undefined;
    return {
      get: async (key: string) => data.get(key),
      set: async (key: string, value: unknown) => void data.set(key, value),
      delete: async (key: string) => data.delete(key),
      keys: async () => [...data.keys()],
      save: calls.save,
    };
  },
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: calls.writeText }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: calls.openUrl }));

const { createAdapters } = await import("../src/platform/index.ts");
const { STORE_FILE } = await import("../src/platform/store.ts");
const { bootstrap } = await import("../src/core.ts");
const { readAppConfig } = await import("../src/config.ts");

beforeEach(() => {
  data.clear();
  storeReady = true;
  vi.clearAllMocks();
});

describe("KeyValueStore(tauri-plugin-store)", () => {
  it("Rust가 만든 스토어를 한 번만 가져온다(load 없음)", async () => {
    const { store } = createAdapters();
    await store.get("a");
    await store.get("b");
    expect(calls.getStore).toHaveBeenCalledTimes(1);
    expect(calls.getStore).toHaveBeenCalledWith(STORE_FILE);
    expect(STORE_FILE).toBe("lotto-lab.json"); // 경로 구분자 없는 파일명 = 앱 데이터 폴더 바로 아래
  });

  it("get·set·delete·keys(prefix) 계약, flush = save", async () => {
    const { store } = createAdapters();
    expect(await store.get("a")).toBeNull();
    await store.set("ll:t:1", "1");
    await store.set("ll:t:2", "2");
    await store.set("other", "x");
    expect(await store.get("ll:t:1")).toBe("1");
    expect((await store.keys("ll:t:")).sort()).toEqual(["ll:t:1", "ll:t:2"]);
    await store.delete("ll:t:1");
    expect(await store.get("ll:t:1")).toBeNull();
    expect(calls.save).not.toHaveBeenCalled();
    await store.flush();
    expect(calls.save).toHaveBeenCalledTimes(1);
  });

  it("첫 로드 실패는 캐시하지 않고 다음 호출에서 다시 시도한다", async () => {
    const { store } = createAdapters();
    storeReady = false;
    await expect(store.get("a")).rejects.toMatchObject({ code: "STORAGE_FAILED" });
    storeReady = true;
    await store.set("a", "1");
    expect(await store.get("a")).toBe("1");
    expect(calls.getStore).toHaveBeenCalledTimes(2);
  });

  it("문자열이 아닌 값은 없음으로 본다", async () => {
    data.set("n", 1);
    expect(await createAdapters().store.get("n")).toBeNull();
  });
});

describe("클립보드·공유·외부 링크", () => {
  it("클립보드·외부 링크는 플러그인에, 공유는 클립보드 복사로", async () => {
    const adapters = createAdapters();
    await adapters.clipboard.writeText("1 2 3");
    expect(calls.writeText).toHaveBeenLastCalledWith("1 2 3");
    await adapters.share.share({ title: "번호", text: "1 2 3", url: "https://example.com" });
    expect(calls.writeText).toHaveBeenLastCalledWith("번호\n1 2 3\nhttps://example.com");
    await adapters.openExternal.open("https://example.com/a");
    expect(calls.openUrl).toHaveBeenCalledWith("https://example.com/a");
  });

  it("외부 링크는 http·https만 연다", async () => {
    const { openExternal } = createAdapters();
    for (const url of ["javascript:alert(1)", "file:///C:/Windows", "ms-settings:", "not a url"]) {
      await expect(openExternal.open(url)).rejects.toBeInstanceOf(AppCoreError);
    }
    expect(calls.openUrl).not.toHaveBeenCalled();
  });
});

describe("난수·app-core 연결", () => {
  it("받은 배열을 채운다", () => {
    const buffer = new Uint32Array(16);
    createAdapters().random.fill(buffer);
    expect(buffer.some((v) => v !== 0)).toBe(true);
  });

  it("키가 없으면 core 없이, publishable 키가 있으면 core를 만든다", () => {
    expect(bootstrap(createAdapters(), readAppConfig({})).configError).toBe(true);
    // 운영 빌드는 로컬 주소로 대체하지 않는다.
    expect(readAppConfig({ PROD: true, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }).supabaseUrl).toBe("");
    expect(bootstrap(createAdapters(), readAppConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" })).configError).toBe(false);
  });
});
