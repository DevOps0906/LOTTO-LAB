// 테마 번호 연결(M-17, task-038): 실제 app-core·fortune-engine에 메모리 저장소를 주입해
// M-15 진입 → 꿈 테마 생성 → 같은 날 같은 입력은 같은 번호 → generated·method 저장, 입력값은 저장소·네트워크에 없음을 확인한다.
import { FORTUNE_SECRET_KEY, createAppCore, type Adapters, type KeyValueStore } from "@lotto-lab/app-core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import type { CoreState } from "../src/core.ts";

function memoryStore(map: Map<string, string>): KeyValueStore {
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
    delete: async (key) => void map.delete(key),
    keys: async (prefix) => [...map.keys()].filter((k) => k.startsWith(prefix)),
    flush: async () => {},
  };
}

function confirmedCore(map = new Map<string, string>()) {
  map.set("ll:v1:settings:app", JSON.stringify({ v: 1, age_confirmed_at: "2026-11-12T03:00:00.000Z" }));
  const fetch = vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  });
  const adapters: Adapters = {
    store: memoryStore(map),
    clock: { now: () => new Date("2026-11-12T03:00:00.000Z") },
    random: { fill: (b) => crypto.getRandomValues(b as Uint32Array<ArrayBuffer>) },
    fetch,
    clipboard: { writeText: async () => {} },
    share: { share: async () => {} },
    openExternal: { open: async () => {} },
  };
  const state: CoreState = {
    core: createAppCore(adapters, { supabaseUrl: "http://127.0.0.1:54521", publishableKey: "sb_publishable_test" }),
    configError: false,
  };
  return { state, map, fetch };
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

const firstGame = () => within(screen.getByRole("list", { name: "1게임 번호" })).getAllByRole("listitem").map((li) => li.textContent);

afterEach(() => {
  window.location.hash = "";
});

describe("테마 번호 연결", () => {
  it("M-15 진입 → 꿈 테마: 같은 날 같은 입력은 같은 번호, generated·method=dream 저장, 입력값 미저장·미전송", async () => {
    const { state, map } = confirmedCore();
    window.location.hash = "#/generate";
    render(<App core={state} />);
    expect(await screen.findByRole("link", { name: "운세·테마 번호" })).toHaveAttribute("href", "#/generate/theme");
    go("#/generate/theme");
    await screen.findByRole("heading", { level: 1, name: "테마 번호" });
    const fetchesBefore = (state.core!.adapters.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    fireEvent.click(screen.getByRole("radio", { name: "꿈" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "돼지" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "용" }));
    fireEvent.click(screen.getByRole("button", { name: "오늘의 번호 생성" }));
    expect(await screen.findByRole("heading", { name: "오늘의 테마 번호 (5게임)" })).toBeInTheDocument();
    expect(screen.getByText(/테마 출처/)).toHaveTextContent("테마 출처 꿈 · 생성 이력에 저장됨");
    const first = firstGame();
    expect(first).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "같은 조건으로 다시 생성" }));
    await screen.findByText(/테마 출처/);
    await vi.waitFor(() => expect([...map.keys()].filter((k) => k.startsWith("ll:v1:generated:"))).toHaveLength(10));
    expect(firstGame()).toStrictEqual(first);

    const generated = [...map.entries()].filter(([k]) => k.startsWith("ll:v1:generated:")).map(([, v]) => JSON.parse(v));
    expect(generated.every((g) => g.method === "dream" && g.game === "lotto" && g.engine_version === "fortune@1+lotto@1")).toBe(true);
    expect([...map.keys()].filter((k) => k.startsWith("ll:v1:ticket:"))).toHaveLength(0);
    expect(JSON.parse(map.get(FORTUNE_SECRET_KEY)!)).toMatch(/^[0-9a-f]{64}$/);
    const dump = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("\n");
    for (const value of ["pig", "dragon", "keywords", "theme"]) expect(dump).not.toContain(value);
    expect((state.core!.adapters.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchesBefore);

    // 행운 숫자 → M-02 고정 번호
    fireEvent.click(screen.getByRole("radio", { name: "행운 숫자" }));
    expect(screen.getByRole("link", { name: "행운 숫자는 고정 번호 설정" })).toHaveAttribute("href", "#/generate/lotto");
  });
});
