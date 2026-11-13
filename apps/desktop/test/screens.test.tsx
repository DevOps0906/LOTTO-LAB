// D 화면 연결(D-01·D-02·D-03·D-09): 실제 app-core(엔진·LocalStore)에 메모리 저장소를 주입하고 네트워크는 끊는다.
import { createAppCore, type Adapters, type KeyValueStore } from "@lotto-lab/app-core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import type { CoreState } from "../src/core.ts";
import { createClipboardShare } from "../src/platform/share.ts";

function memoryStore(map: Map<string, string>): KeyValueStore {
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
    delete: async (key) => void map.delete(key),
    keys: async (prefix) => [...map.keys()].filter((k) => k.startsWith(prefix)),
    flush: async () => {},
  };
}

/** 19세 확인을 마친 기기, 오프라인(fetch 실패). 공유는 Windows처럼 클립보드 복사. */
function confirmedCore(map = new Map<string, string>()) {
  map.set("ll:v1:settings:app", JSON.stringify({ v: 1, age_confirmed_at: "2026-11-12T03:00:00.000Z" }));
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
  const clipboard = { writeText };
  const adapters: Adapters = {
    store: memoryStore(map),
    clock: { now: () => new Date("2026-11-12T03:00:00.000Z") },
    random: { fill: (b) => crypto.getRandomValues(b as Uint32Array<ArrayBuffer>) },
    fetch: vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
    clipboard,
    share: createClipboardShare(clipboard),
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

describe("D-01 대시보드", () => {
  it("M-01 블록 재사용 + 좌[최신 회차·상품 카드·지난 회차 결과] | 우[통계 요약·CTA·내 기록], 기록 없음은 생성/구매등록 CTA", async () => {
    const { state } = confirmedCore();
    const { container } = render(<App core={state} />);
    await screen.findByRole("heading", { level: 1, name: "대시보드" });
    const cols = container.querySelectorAll(".ll-home__grid > .ll-home__col");
    expect(cols).toHaveLength(2);
    expect(within(cols[0] as HTMLElement).getByRole("heading", { name: "최신 회차" })).toBeInTheDocument();
    expect(within(cols[0] as HTMLElement).getByRole("navigation", { name: "복권 선택" })).toBeInTheDocument();
    expect(within(cols[0] as HTMLElement).getByRole("heading", { name: "지난 회차 결과" })).toBeInTheDocument();
    expect(within(cols[1] as HTMLElement).getByRole("heading", { name: "이번 주 통계 요약" })).toBeInTheDocument();
    expect(within(cols[1] as HTMLElement).getByRole("link", { name: /번호 생성하기/ })).toHaveAttribute("href", "#/lotto");
    expect(await within(cols[1] as HTMLElement).findByText("아직 저장한 번호가 없습니다")).toBeInTheDocument();
    // 준비 중 화면(통계·내 번호·회차·구매 등록)으로 가는 화면 안 바로가기는 없다(사이드바는 그대로).
    const main = container.querySelector("main")!;
    const hrefs = Array.from(main.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.filter((h) => /^#\/(stats|tickets|draws|alerts)/.test(h))).toEqual([]);
    // 오프라인: 공식 결과는 오류 + 다시 시도(앱은 계속 동작)
    expect(await screen.findByText("지난 회차 결과를 불러오지 못했습니다")).toBeInTheDocument();
  });
});

describe("D-02·D-03 생성(조건 좌·결과 우)", () => {
  it("로또: split 배치, 오프라인 생성 성공, 공유 버튼 없이 복사만", async () => {
    const { state, writeText } = confirmedCore();
    window.location.hash = "#/lotto";
    const { container } = render(<App core={state} />);
    await screen.findByRole("heading", { level: 1, name: "로또 번호 생성" });
    expect(container.querySelector(".ll-gen")).toHaveAttribute("data-layout", "split");
    expect(screen.queryByRole("navigation", { name: "현재 위치" })).toBeNull();
    expect(screen.queryByRole("link", { name: /지난 회차 통계 보기/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    await screen.findByRole("list", { name: "추천 번호 목록" });
    expect(screen.queryByRole("button", { name: "공유" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "전체 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
  });

  it("연금: 1조 000719 앞자리 0 보존, 사이드바 현재 항목은 연금 생성", async () => {
    const { state, writeText } = confirmedCore();
    window.location.hash = "#/pension";
    const { container } = render(<App core={state} />);
    await screen.findByRole("heading", { level: 1, name: "연금복권 번호 생성" });
    expect(container.querySelector(".ll-gen")).toHaveAttribute("data-layout", "split");
    expect(screen.getByRole("navigation", { name: "주 메뉴" }).querySelector('[aria-current="page"]')).toHaveAttribute("href", "#/pension");
    for (const [i, label] of ["십만", "만", "천", "백", "십", "일"].entries()) {
      fireEvent.change(screen.getByRole("textbox", { name: `${label} 자리` }), { target: { value: "000719"[i] } });
    }
    fireEvent.click(screen.getByRole("button", { name: "번호 생성" }));
    const list = await screen.findByRole("list", { name: "추천 번호 목록" });
    expect(list).toHaveTextContent("000719");
    fireEvent.click(screen.getByRole("button", { name: "전체 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("000719")));
  });
});

describe("D-09 설정", () => {
  it("M-12 재사용(2열 그리드), Windows는 JSON 복사만(공유 숨김), 테마 변경을 셸에 알린다", async () => {
    const { state } = confirmedCore();
    const onThemeChange = vi.fn();
    window.location.hash = "#/settings";
    const { container } = render(<App core={state} onThemeChange={onThemeChange} />);
    fireEvent.click(await screen.findByRole("radio", { name: "다크" }));
    expect(onThemeChange).toHaveBeenCalledWith("dark");
    expect(container.querySelector(".ll-settings__grid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "내보내기(JSON 복사)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내보내기(공유)" })).toBeNull();
  });
});

describe("아직 없는 화면", () => {
  it("통계·내 번호·회차·알림은 준비 중 안내", async () => {
    const { state } = confirmedCore();
    render(<App core={state} />);
    await screen.findByRole("heading", { level: 1, name: "대시보드" });
    for (const [hash, title] of [
      ["#/stats", "통계"],
      ["#/tickets", "내 번호"],
      ["#/draws", "회차 결과"],
      ["#/alerts", "알림"],
    ] as const) {
      go(hash);
      expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByText("준비 중인 화면입니다")).toBeInTheDocument();
    }
  });
});
