// 첫 실행 19세 확인(DF-6): 실제 app-core(AgeGate·LocalStore)에 메모리 저장소·실패하는 fetch를 주입해 셸 흐름을 확인한다.
import { createAppCore, type Adapters, type KeyValueStore } from "@lotto-lab/app-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import type { CoreState } from "../src/core.ts";

function memoryStore(map = new Map<string, string>()): KeyValueStore {
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
    delete: async (key) => void map.delete(key),
    keys: async (prefix) => [...map.keys()].filter((k) => k.startsWith(prefix)),
    flush: async () => {},
  };
}

function coreWith(store: KeyValueStore): CoreState {
  const adapters: Adapters = {
    store,
    clock: { now: () => new Date("2026-11-12T03:00:00.000Z") },
    random: { fill: (b) => crypto.getRandomValues(b as Uint32Array<ArrayBuffer>) },
    // 로컬 Supabase 없음: 공개 읽기는 NETWORK 오류 → 홈은 오류 상태
    fetch: vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
    clipboard: { writeText: async () => {} },
    share: { share: async () => {} },
    openExternal: { open: async () => {} },
  };
  return { core: createAppCore(adapters, { supabaseUrl: "http://127.0.0.1:54521", publishableKey: "sb_publishable_test" }), configError: false };
}

afterEach(() => {
  window.location.hash = "";
});

describe("19세 확인 게이트", () => {
  it("미확인이면 탭·홈 대신 M-05만 보이고, 해시로 다른 화면에 가도 막힌다", async () => {
    window.location.hash = "#/tickets";
    render(<App core={coreWith(memoryStore())} />);
    expect(await screen.findByRole("heading", { level: 1, name: "LOTTO LAB 시작하기" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "하단 탭" })).not.toBeInTheDocument();
    expect(screen.queryByText("내 번호")).not.toBeInTheDocument();
  });

  it("확인하면 기기에 기록되고 다음 실행부터는 바로 홈(오류 상태: 로컬 Supabase 없음)", async () => {
    const map = new Map<string, string>();
    const first = render(<App core={coreWith(memoryStore(map))} />);
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("radio", { name: "네, 만 19세 이상입니다" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "게스트로 시작" }));
    expect(await screen.findByRole("navigation", { name: "하단 탭" })).toBeInTheDocument();
    expect([...map.keys()]).toContain("ll:v1:settings:app");
    first.unmount();

    render(<App core={coreWith(memoryStore(map))} />);
    expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
    expect(await screen.findByText("회차 정보를 불러오지 못했습니다")).toBeInTheDocument();
    expect(await screen.findByText("아직 저장한 번호가 없습니다")).toBeInTheDocument();
  });

  it("미성년 선택은 종료 안내로 끝나고 기록을 남기지 않는다", async () => {
    const map = new Map<string, string>();
    render(<App core={coreWith(memoryStore(map))} />);
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("radio", { name: "아니요, 만 19세 미만입니다" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("만 19세 이상만 이용할 수 있습니다")).toBeInTheDocument();
    expect(map.size).toBe(0);
  });

  it("미구현 화면(#/stats)은 준비 중 + 홈으로 돌아가기", async () => {
    const map = new Map([["ll:v1:settings:app", JSON.stringify({ v: 1, age_confirmed_at: "2026-11-12T00:00:00.000Z" })]]);
    window.location.hash = "#/stats";
    render(<App core={coreWith(memoryStore(map))} />);
    expect(await screen.findByText("준비 중")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("통계");
    expect(screen.getByRole("link", { name: "홈으로 돌아가기" })).toHaveAttribute("href", "#/");
  });
});
