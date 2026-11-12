// 생성 화면 연결(M-02·M-03): 실제 app-core(엔진·LocalStore)에 메모리 저장소를 주입해 생성 → 저장 → 지난 설정 복원 흐름을 확인한다.
import { createAppCore, type Adapters, type KeyValueStore } from "@lotto-lab/app-core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

/** 19세 확인을 마친 기기(설정 레코드 있음). */
function confirmedCore(map = new Map<string, string>()) {
  map.set("ll:v1:settings:app", JSON.stringify({ v: 1, age_confirmed_at: "2026-11-12T03:00:00.000Z" }));
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
  const adapters: Adapters = {
    store: memoryStore(map),
    clock: { now: () => new Date("2026-11-12T03:00:00.000Z") },
    random: { fill: (b) => crypto.getRandomValues(b as Uint32Array<ArrayBuffer>) },
    fetch: vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
    clipboard: { writeText },
    share: { share: async () => {} },
    openExternal: { open: async () => {} },
  };
  const state: CoreState = {
    core: createAppCore(adapters, { supabaseUrl: "http://127.0.0.1:54521", publishableKey: "sb_publishable_test" }),
    configError: false,
  };
  return { state, map, writeText };
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

afterEach(() => {
  window.location.hash = "";
});

describe("생성 화면 연결", () => {
  it("연금 1조 000719: 실제 엔진 생성 → 즐겨찾기 저장(구매 아님) → 지난 설정으로 다시 만들기가 조건을 복원", async () => {
    const { state, map, writeText } = confirmedCore();
    window.location.hash = "#/generate/pension";
    render(<App core={state} />);
    await screen.findByRole("heading", { level: 1, name: "연금복권 번호 생성" });
    for (const [i, label] of ["십만", "만", "천", "백", "십", "일"].entries()) {
      fireEvent.change(screen.getByRole("textbox", { name: `${label} 자리` }), { target: { value: "000719"[i] } });
    }
    fireEvent.click(screen.getByRole("button", { name: "번호 생성" }));
    const list = await screen.findByRole("list", { name: "추천 번호 목록" });
    expect(list).toHaveTextContent("1조000719");
    fireEvent.click(screen.getByRole("checkbox", { name: "1조 000719 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1개 저장" }));
    await waitFor(() => expect(within(list).getByText("즐겨찾기 저장됨")).toBeInTheDocument());
    const tickets = [...map.entries()].filter(([k]) => k.startsWith("ll:v1:ticket:")).map(([, v]) => JSON.parse(v));
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ purchase_status: "favorite", game: "pension", ticket_data: { group_no: 1, digits: "000719" } });
    fireEvent.click(screen.getByRole("button", { name: "1조 000719 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "복사" }));
    expect(writeText).toHaveBeenCalledWith("1조 000719");

    // M-15 → 지난 설정으로 다시 만들기
    go("#/generate");
    fireEvent.click(await screen.findByRole("link", { name: "지난 설정으로 다시 만들기" }));
    go("#/generate/pension?from=last");
    expect(await screen.findByText(/지난 설정을 불러왔어요/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "십만 자리" })).toHaveValue("0");
    expect(screen.getByRole("textbox", { name: "백 자리" })).toHaveValue("7");
    expect(screen.getByRole("textbox", { name: "일 자리" })).toHaveValue("9");
  });

  it("로또 불가능 조건(고정 5개 + 50게임): 실제 엔진 오류 → 최대 게임 수로 줄여 생성", async () => {
    const { state } = confirmedCore();
    window.location.hash = "#/generate/lotto";
    render(<App core={state} />);
    await screen.findByRole("heading", { level: 1, name: "로또 번호 생성" });
    fireEvent.click(screen.getByRole("radio", { name: "조건 지정" }));
    for (const n of [1, 2, 3, 4, 5]) fireEvent.click(screen.getByRole("button", { name: `${n}번` }));
    fireEvent.click(screen.getByRole("radio", { name: "직접" }));
    fireEvent.change(screen.getByRole("textbox", { name: /직접 입력/ }), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    const problem = (await screen.findByText("조건에 맞는 조합이 부족해요")).closest<HTMLElement>(".ll-gen__problem")!;
    expect(problem).toHaveTextContent("최대 40게임");
    fireEvent.click(within(problem).getByRole("button", { name: "게임 수를 40게임으로 줄이기" }));
    fireEvent.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    expect(await screen.findByRole("heading", { name: "추천 번호 (40게임)" })).toBeInTheDocument();
  });
});
