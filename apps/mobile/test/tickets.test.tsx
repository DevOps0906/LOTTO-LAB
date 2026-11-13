// 내 번호(M-07)·상세·당첨 확인(M-08)·구매 등록(M-09)·설정(M-12) 연결: 실제 app-core(TicketService·CheckService·LocalData)에
// 메모리 저장소·PostgREST 응답 목을 주입해 라우트 → 저장 → 판정 → 화면을 확인한다(상태 분리·000719 보존·멱등·모두 삭제).
import { AppCoreError, createAppCore, type Adapters, type KeyValueStore } from "@lotto-lab/app-core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import type { CoreState } from "../src/core.ts";
import { createThemeController } from "../src/theme.ts";

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
// 최신 회차: 로또 1132(2026-11-07) · 연금 290(2026-11-06) → KST 2026-11-12 기준 제안 회차 1133·291
const LOTTO = {
  draw_no: 1132,
  draw_date: "2026-11-07",
  nums: [3, 11, 19, 27, 35, 43],
  bonus: 7,
  prizes: [],
  source_url: "https://synthetic.invalid/lotto/1132",
  source_verified_at: VERIFIED,
};
const PENSION = {
  draw_no: 290,
  draw_date: "2026-11-06",
  group_no: 1,
  digits: "000719",
  bonus_digits: "052381",
  prizes: [],
  source_url: "https://synthetic.invalid/pension/290",
  source_verified_at: VERIFIED,
};

function respond(url: string): unknown[] {
  const u = new URL(url);
  const eq = u.searchParams.get("draw_no")?.replace(/^eq\./, "");
  if (u.pathname.endsWith("/draws_lotto")) return !eq || eq === "1132" ? [LOTTO] : [];
  if (u.pathname.endsWith("/draws_pension")) return !eq || eq === "290" ? [PENSION] : [];
  return [];
}

function confirmedCore() {
  const map = new Map<string, string>();
  map.set("ll:v1:settings:app", JSON.stringify({ v: 1, age_confirmed_at: "2026-11-12T03:00:00.000Z" }));
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
  const adapters: Adapters = {
    store: memoryStore(map),
    clock: { now: () => new Date("2026-11-12T03:00:00.000Z") },
    random: { fill: (b) => crypto.getRandomValues(b as Uint32Array<ArrayBuffer>) },
    fetch: vi.fn(async (url: string) => new Response(JSON.stringify(respond(url)), { status: 200 })),
    clipboard: { writeText },
    share: { share: async () => {} },
    openExternal: { open: async () => {} },
  };
  const core = createAppCore(adapters, { supabaseUrl: "http://127.0.0.1:54521", publishableKey: "sb_publishable_test" });
  const state: CoreState = { core, configError: false };
  return { state, core, map, writeText };
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

afterEach(() => {
  window.location.hash = "";
  document.documentElement.classList.remove("dark");
});

describe("내 번호 연결(M-07·M-08·M-09)", () => {
  it("생성 이력 → 즐겨찾기 저장: 구매 기록으로 섞이지 않고, 구매 기록은 즐겨찾기로 되돌릴 수 없다", async () => {
    const { state, core } = confirmedCore();
    const gen = await core.generator.generate({ game: "pension", config: { groups: [4], positions: ["0", "0", "0", "7", "1", "9"], games: 1 } });
    window.location.hash = "#/tickets?tab=generated";
    render(<App core={state} />);
    await screen.findByRole("heading", { level: 1, name: "내 번호" });
    fireEvent.click(await screen.findByRole("button", { name: "연금복권 720+ 4조 000719 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "즐겨찾기로 저장" }));
    expect(await screen.findByRole("link", { name: "저장됨 · 즐겨찾기에서 보기" })).toBeInTheDocument();
    const tickets = await core.tickets.list();
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ purchase_status: "favorite", round: null, source_number_id: gen.records[0]!.id, ticket_data: { digits: "000719" } });
    expect(await core.tickets.list({ status: "purchased" })).toHaveLength(0);
    // 구매로 전환 후에는 즐겨찾기로 되돌릴 수 없다(R19)
    await core.tickets.changeStatus(tickets[0]!.id, { purchase_status: "purchased", purchase_date: "2026-11-12" });
    const back = await core.tickets.changeStatus(tickets[0]!.id, { purchase_status: "favorite" }).catch((e: unknown) => e);
    expect(back).toBeInstanceOf(AppCoreError);
    expect((back as AppCoreError).code).toBe("INVALID_TRANSITION");
  });

  it("#/tickets/register: 연금 000719 등록(회차 기본값 291) → 상세 → 당첨 확인(추첨 전), 같은 화면 재제출은 1건", async () => {
    const { state, core, map, writeText } = confirmedCore();
    window.location.hash = "#/tickets/register";
    render(<App core={state} />);
    await screen.findByRole("heading", { level: 1, name: "구매 등록" });
    fireEvent.click(screen.getByRole("radio", { name: "연금복권 720+" }));
    fireEvent.click(screen.getByRole("radio", { name: "1조" }));
    fireEvent.change(screen.getByRole("textbox", { name: "여섯 자리" }), { target: { value: "000719" } });
    expect(await screen.findByDisplayValue("291")).toBeInTheDocument();
    expect(screen.getByLabelText("구매일")).toHaveValue("2026-11-12");
    fireEvent.click(screen.getByRole("checkbox", { name: "실제로 구매한 번호가 맞습니다(필수)" }));
    const submit = screen.getByRole("button", { name: "구매 등록 확정" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await screen.findByRole("heading", { level: 1, name: "연금복권 720+ 제 291회" });
    const keys = [...map.keys()].filter((k) => k.startsWith("ll:v1:ticket:"));
    expect(keys).toHaveLength(1);
    const stored = JSON.parse(map.get(keys[0]!)!);
    expect(stored).toMatchObject({ purchase_status: "purchased", round: 291, amount_won: 1000, ticket_data: { group_no: 1, digits: "000719" } });
    expect(window.location.hash).toBe(`#/tickets/${stored.id}`);
    // 291 > 수집된 최신 290 → 추첨 전
    expect(await screen.findByText("추첨 전")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("1조 000719"));
    // 같은 멱등 키로 다시 저장해도 같은 기록(1건)
    await core.tickets.save({
      game: "pension",
      ticket_data: { group_no: 1, digits: "000719" },
      purchase_status: "purchased",
      purchase_date: "2026-11-12",
      amount_won: 1000,
      round: 291,
      idempotency_key: stored.id,
    });
    expect([...map.keys()].filter((k) => k.startsWith("ll:v1:ticket:"))).toHaveLength(1);
  });

  it("#/tickets/check: 구매 기록만 판정 — 연금 1등 + 보너스 별도, 즐겨찾기 제외, M-11에서 연결", async () => {
    const { state, core } = confirmedCore();
    await core.tickets.save({ game: "pension", ticket_data: { group_no: 1, digits: "000719" }, purchase_status: "purchased", purchase_date: "2026-11-05", round: 290 });
    await core.tickets.save({ game: "pension", ticket_data: { group_no: 2, digits: "052381" }, purchase_status: "purchased", purchase_date: "2026-11-05", round: 290 });
    await core.tickets.save({ game: "lotto", ticket_data: { nums: [3, 11, 19, 27, 35, 43] }, purchase_status: "favorite", round: 1132 });
    window.location.hash = "#/draws/pension/290";
    render(<App core={state} />);
    const link = await screen.findByRole("link", { name: "내 번호에서 확인하기" });
    expect(link).toHaveAttribute("href", "#/tickets/check");
    go("#/tickets/check");
    await screen.findByRole("heading", { level: 1, name: "당첨 확인" });
    const card = (await screen.findByText("연금복권 720+ 제 290회")).closest(".ll-card") as HTMLElement;
    expect(within(card).getByText("1등")).toBeInTheDocument();
    // 052381 = 보너스 6자리 일치(등위와 따로)
    expect(within(card).getByText("보너스 일치")).toBeInTheDocument();
    expect(within(card).getByText("synthetic.invalid 공개 결과")).toBeInTheDocument();
    expect(document.querySelectorAll(".ll-tickets__item")).toHaveLength(2);
    expect(screen.getByRole("navigation", { name: "하단 탭" }).querySelector('[aria-current="page"]')).toHaveAttribute("href", "#/tickets");
  });
});

describe("설정 연결(M-12)", () => {
  it("테마 다크 → <html>.dark 적용·저장, 모두 삭제 → 저장소 비움 + onCleared", async () => {
    const { state, core, map } = confirmedCore();
    await core.tickets.save({ game: "pension", ticket_data: { group_no: 1, digits: "000719" }, purchase_status: "favorite", round: null });
    const theme = createThemeController();
    const onCleared = vi.fn();
    window.location.hash = "#/settings";
    render(<App core={state} onThemeChange={(t) => theme.set(t)} onCleared={onCleared} />);
    fireEvent.click(await screen.findByRole("radio", { name: "다크" }));
    expect(document.documentElement).toHaveClass("dark");
    await waitFor(async () => expect(await core.theme.get()).toBe("dark"));
    fireEvent.click(screen.getByRole("radio", { name: "라이트" }));
    expect(document.documentElement).not.toHaveClass("dark");

    fireEvent.change(screen.getByRole("textbox", { name: /확인을 위해/ }), { target: { value: "모두 삭제" } });
    fireEvent.click(screen.getByRole("button", { name: "모든 데이터 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1));
    expect(map.size).toBe(0);
    expect(await core.ageGate.isConfirmed()).toBe(false);
    theme.dispose();
  });
});
