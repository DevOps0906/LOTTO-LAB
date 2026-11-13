// 통계(M-04)·회차 목록(M-16)·회차 상세(M-11) 연결: 실제 app-core(PublicReader)에 PostgREST 응답 목을 주입해 라우트 → 읽기 → 화면을 확인한다.
import { createAppCore, type Adapters, type KeyValueStore } from "@lotto-lab/app-core";
import { act, render, screen, within } from "@testing-library/react";
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

const VERIFIED = "2026-11-12T02:00:00.000Z";
const LOTTO = [3, 2, 1].map((n) => ({
  draw_no: n,
  draw_date: `2026-01-${String(n * 7).padStart(2, "0")}`,
  nums: [3, 11, 19, 27, 35, 43],
  bonus: 7,
  prizes: [{ rank: 1, bonus: false, amount_won: 2000000000, winners: 1, payout: "lump" }],
  source_url: `https://synthetic.invalid/lotto/${n}`,
  source_verified_at: VERIFIED,
}));
const PENSION = {
  draw_no: 1,
  draw_date: "2026-01-08",
  group_no: 1,
  digits: "000719",
  bonus_digits: "052381",
  prizes: [{ rank: 1, bonus: false, amount_won: 7000000, winners: 1, payout: "annuity", months: 240 }],
  source_url: "https://synthetic.invalid/pension/1",
  source_verified_at: VERIFIED,
};

function respond(url: string): unknown[] {
  const u = new URL(url);
  const eq = u.searchParams.get("draw_no")?.replace(/^eq\./, "");
  if (u.pathname.endsWith("/draws_lotto")) return eq ? LOTTO.filter((d) => String(d.draw_no) === eq) : LOTTO.slice(0, Number(u.searchParams.get("limit")));
  if (u.pathname.endsWith("/draws_pension")) return eq && eq !== "1" ? [] : [PENSION];
  return [];
}

function confirmedCore() {
  const map = new Map<string, string>();
  map.set("ll:v1:settings:app", JSON.stringify({ v: 1, age_confirmed_at: "2026-11-12T03:00:00.000Z" }));
  const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(respond(url)), { status: 200 }));
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
  return { state, fetch };
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

describe("통계·회차 화면 연결", () => {
  it("#/stats: M-04, 통계 0행이면 미갱신 + 기간 변경 CTA", async () => {
    const { state, fetch } = confirmedCore();
    window.location.hash = "#/stats";
    render(<App core={state} />);
    await screen.findByRole("heading", { level: 1, name: "통계" });
    expect(await screen.findByText("최근 50회 통계가 아직 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체 기간으로 보기" })).toBeInTheDocument();
    expect(String(fetch.mock.calls[0]![0])).toContain("statistics_cache?select=");
    expect(screen.getByRole("navigation", { name: "하단 탭" }).querySelector('[aria-current="page"]')).toHaveAttribute("href", "#/stats");
  });

  it("#/draws → 상세: 목록(최신부터) → 회차 상세(당첨금·출처), 연금 000719", async () => {
    const { state, fetch } = confirmedCore();
    window.location.hash = "#/draws";
    render(<App core={state} />);
    const list = await screen.findByRole("region", { name: "로또 6/45 회차 목록" });
    expect(String(fetch.mock.calls[0]![0])).toContain("draws_lotto?select=");
    expect(String(fetch.mock.calls[0]![0])).toContain("&order=draw_no.desc&limit=20");
    const hrefs = within(list).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["#/draws/lotto/3", "#/draws/lotto/2", "#/draws/lotto/1"]);

    go("#/draws/lotto/2");
    await screen.findByRole("heading", { level: 1, name: "로또 6/45 제 2회" });
    expect(await screen.findAllByText("2,000,000,000원")).not.toHaveLength(0);
    expect(screen.getByText("synthetic.invalid 공개 결과")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "다음 회차" })).toHaveAttribute("href", "#/draws/lotto/3");
    expect(screen.getByRole("navigation", { name: "하단 탭" }).querySelector('[aria-current="page"]')).toHaveAttribute("href", "#/stats");

    go("#/draws/pension/1");
    expect(await screen.findByText("000719")).toBeInTheDocument();
    expect(await screen.findAllByText("월 7,000,000원 × 240개월")).not.toHaveLength(0);
  });

  it("잘못된 회차 주소·0행 회차", async () => {
    const { state } = confirmedCore();
    window.location.hash = "#/draws/lotto/abc";
    render(<App core={state} />);
    expect(await screen.findByText("회차 번호가 올바르지 않습니다")).toBeInTheDocument();
    go("#/draws/pension/9");
    expect(await screen.findByText("제 9회 결과가 아직 없습니다")).toBeInTheDocument();
  });
});
