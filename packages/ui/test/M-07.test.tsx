import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MyTickets } from "../src";
import { fakeTicketsCore, favorite, history, purchased, renderWithNotice } from "./ticket-core";

const links = {
  generate: "#/generate",
  settings: "#/settings",
  register: "#/tickets/register",
  registerFrom: (id: string) => `#/tickets/register?ticket=${id}`,
  check: "#/tickets/check",
  detail: (id: string) => `#/tickets/${id}`,
};

const FAV_PENSION = favorite({ game: "pension", ticket_data: { group_no: 1, digits: "000719" } });
const FAV_LOTTO = favorite({ game: "lotto", ticket_data: { nums: [3, 9, 14, 25, 33, 42] }, created_at: "2026-11-11T00:00:00.000Z" });
const BOUGHT_LOTTO = purchased({ game: "lotto", ticket_data: { nums: [1, 2, 3, 4, 5, 6] }, round: 1132 });
const BOUGHT_PENSION = purchased({ game: "pension", ticket_data: { group_no: 2, digits: "000719" }, round: 290 });
const BOUGHT_NO_ROUND = purchased({ game: "lotto", ticket_data: { nums: [7, 8, 9, 10, 11, 12] }, round: null });
const BOUGHT_FUTURE = purchased({ game: "lotto", ticket_data: { nums: [13, 14, 15, 16, 17, 18] }, round: 1133 });

function items() {
  return Array.from(document.querySelectorAll<HTMLElement>(".ll-tickets__item"));
}

function setup(init: Parameters<typeof fakeTicketsCore>[0] = {}) {
  const f = fakeTicketsCore(init);
  const navigate = vi.fn();
  return { ...f, navigate };
}

describe("M-07 내 번호", () => {
  it("로딩·오류(다시 시도) 상태", async () => {
    const f = setup();
    f.tickets.list.mockReturnValueOnce(new Promise(() => {}));
    const { unmount } = renderWithNotice(<MyTickets core={f.core} links={links} navigate={f.navigate} />);
    expect(screen.getByText("내 번호를 불러오는 중입니다")).toBeInTheDocument();
    unmount();
    f.tickets.list.mockRejectedValueOnce(new Error("io"));
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={f.navigate} />);
    expect(await screen.findByText("내 번호를 불러오지 못했습니다")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("즐겨찾기한 번호가 없습니다")).toBeInTheDocument();
  });

  it("탭으로 상태를 나눈다 — 즐겨찾기 행에는 대조(판정) 없음, 구매 기록 행만 판정, 생성 이력은 추천 번호 배지", async () => {
    const f = setup({ tickets: [FAV_PENSION, BOUGHT_LOTTO], history: [history({ game: "lotto", nums: [5, 10, 15, 20, 25, 30] })] });
    f.judge.mockImplementation((t) => ({
      ticket: t,
      status: "checked",
      draw_no: 1132,
      result: { matched_rank: 3, bonus_hit: false },
      source_url: "https://example.test/1132",
      source_verified_at: "2026-11-07T12:00:00.000Z",
      fetched_at: "2026-11-12T02:00:00.000Z",
      stale: false,
    }));
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={f.navigate} />);
    // 즐겨찾기 탭
    await screen.findByText("000719");
    expect(screen.getByRole("tab", { name: "즐겨찾기" })).toHaveAttribute("aria-selected", "true");
    expect(items()).toHaveLength(1);
    expect(within(items()[0]!).getByText("즐겨찾기")).toHaveClass("ll-badge");
    expect(within(items()[0]!).getByText("구매 전 번호 · 당첨 확인 대상 아님")).toBeInTheDocument();
    expect(document.querySelector("[data-result]")).toBeNull();
    expect(f.checkPurchased).not.toHaveBeenCalled();
    // 구매 기록 탭
    await userEvent.click(screen.getByRole("tab", { name: "구매 기록" }));
    expect(await screen.findByText("3등")).toBeInTheDocument();
    expect(items()).toHaveLength(1);
    expect(within(items()[0]!).getByText("구매 기록")).toHaveAttribute("data-status", "purchased");
    expect(f.checkPurchased).toHaveBeenCalledTimes(1);
    // 생성 이력 탭
    await userEvent.click(screen.getByRole("tab", { name: "생성 이력" }));
    expect(within(items()[0]!).getByText("추천 번호")).toHaveAttribute("data-status", "generated");
    expect(within(items()[0]!).getByText("추천 번호 · 구매 기록 아님")).toBeInTheDocument();
  });

  it("즐겨찾기 메뉴에는 '구매로 등록'(M-09), 구매 기록 메뉴에는 즐겨찾기로 되돌리기·구매로 등록이 없다", async () => {
    const f = setup({ tickets: [FAV_LOTTO, BOUGHT_LOTTO] });
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={f.navigate} />);
    await userEvent.click(await screen.findByRole("button", { name: "로또 6/45 3 9 14 25 33 42 메뉴" }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["구매로 등록", "복사", "공유", "제거"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "구매로 등록" }));
    expect(f.navigate).toHaveBeenCalledWith(`#/tickets/register?ticket=${FAV_LOTTO.id}`);

    await userEvent.click(screen.getByRole("tab", { name: "구매 기록" }));
    await userEvent.click(await screen.findByRole("button", { name: "로또 6/45 1 2 3 4 5 6 메뉴" }));
    const labels = screen.getAllByRole("menuitem").map((m) => m.textContent);
    expect(labels).toEqual(["복사", "공유", "삭제"]);
    expect(labels.some((l) => l?.includes("즐겨찾기"))).toBe(false);
  });

  it("판정 표기: 등위·연금 보너스 별도·회차 미입력·추첨 전", async () => {
    const f = setup({ tickets: [BOUGHT_PENSION, BOUGHT_NO_ROUND, BOUGHT_FUTURE] });
    f.judge.mockImplementation((t) =>
      t.round === null
        ? { ticket: t, status: "no_round" }
        : t.game === "pension"
          ? {
              ticket: t,
              status: "checked",
              draw_no: 290,
              result: { matched_rank: 2, bonus_hit: true },
              source_url: "https://example.test/290",
              source_verified_at: "2026-11-06T12:00:00.000Z",
              fetched_at: null,
              stale: false,
            }
          : { ticket: t, status: "pending", stale: false },
    );
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={f.navigate} initialTab="purchased" />);
    expect(await screen.findByText("2등")).toBeInTheDocument();
    expect(screen.getByText("보너스 일치")).toBeInTheDocument();
    expect(screen.getByText("회차를 입력하세요")).toBeInTheDocument();
    expect(screen.getByText("회차 미입력")).toBeInTheDocument();
    // 1133 > 수집된 최신 1132 → 추첨 전
    expect(await screen.findByText("추첨 전")).toBeInTheDocument();
  });

  it("구매 기록 판정 옆 출처·검증·조회 시각, stale이면 배너 + 다시 확인(force)", async () => {
    const f = setup({ tickets: [BOUGHT_LOTTO] });
    f.judge.mockImplementation((t) => ({
      ticket: t,
      status: "checked",
      draw_no: 1132,
      result: { matched_rank: null, bonus_hit: false },
      source_url: "https://www.dhlottery.co.kr/1132",
      source_verified_at: "2026-11-07T12:00:00.000Z",
      fetched_at: "2026-11-12T02:00:00.000Z",
      stale: true,
    }));
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={f.navigate} initialTab="purchased" />);
    expect(await screen.findByText("낙첨")).toBeInTheDocument();
    const row = items()[0]!;
    expect(within(row).getByText("www.dhlottery.co.kr 공개 결과")).toBeInTheDocument();
    expect(row.querySelector(".ll-updated time")).toHaveAttribute("dateTime", "2026-11-07T12:00:00.000Z");
    expect(within(row).getByText(/조회/)).toBeInTheDocument();
    expect(screen.getByText("서버에 연결하지 못해 마지막으로 받은 정보를 보여 줍니다.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    await waitFor(() => expect(f.checkPurchased).toHaveBeenLastCalledWith(undefined, { force: true }));
  });

  it("구매 기록 삭제: AlertDialog 확인 먼저(취소면 그대로) → 삭제 + 스낵바 실행 취소", async () => {
    const f = setup({ tickets: [BOUGHT_LOTTO] });
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={f.navigate} initialTab="purchased" />);
    await userEvent.click(await screen.findByRole("button", { name: "로또 6/45 1 2 3 4 5 6 메뉴" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "삭제" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("구매 기록을 삭제하면 되돌릴 수 없어요");
    await userEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(f.tickets.remove).not.toHaveBeenCalled();
    expect(items()).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "로또 6/45 1 2 3 4 5 6 메뉴" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "삭제" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "삭제" }));
    expect(await screen.findByText("구매 기록을 삭제했어요")).toBeInTheDocument();
    expect(f.tickets.remove).toHaveBeenCalledWith(BOUGHT_LOTTO.id);
    await userEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    await waitFor(() => expect(items()).toHaveLength(1));
  });

  it("추천에서 저장한 즐겨찾기 제거는 확인 없이 스낵바 + 다시 저장 안내", async () => {
    const fav = favorite({ game: "lotto", ticket_data: { nums: [5, 10, 15, 20, 25, 30] }, source_number_id: "00000000-0000-4000-8000-0000000000bb" });
    const f = setup({ tickets: [fav] });
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={f.navigate} />);
    await userEvent.click(await screen.findByRole("button", { name: "로또 6/45 5 10 15 20 25 30 메뉴" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "제거" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(await screen.findByText("즐겨찾기에서 제거했어요 · 생성 이력에서 다시 저장할 수 있어요")).toBeInTheDocument();
  });

  it("제거 → 스낵바 '내 번호에서 제거했어요' + 실행 취소(restore)", async () => {
    const f = setup({ tickets: [FAV_LOTTO] });
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={f.navigate} />);
    await userEvent.click(await screen.findByRole("button", { name: "로또 6/45 3 9 14 25 33 42 메뉴" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "제거" }));
    expect(await screen.findByText("내 번호에서 제거했어요")).toBeInTheDocument();
    expect(items()).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(f.tickets.restore).toHaveBeenCalledWith(FAV_LOTTO);
  });

  it("생성 이력 → 즐겨찾기로 저장(구매 아님, 회차 null) → 즐겨찾기 탭에 보인다", async () => {
    const h = history({ game: "pension", group_no: 4, digits: "000719" });
    const f = setup({ history: [h] });
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={f.navigate} initialTab="generated" />);
    await userEvent.click(await screen.findByRole("button", { name: "연금복권 720+ 4조 000719 메뉴" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "즐겨찾기로 저장" }));
    expect(await screen.findByText("즐겨찾기로 저장했어요")).toBeInTheDocument();
    expect(f.tickets.saveFromGenerated).toHaveBeenCalledWith(h.id, expect.objectContaining({ purchase_status: "favorite", round: null }));
    expect(screen.getByRole("link", { name: "저장됨 · 즐겨찾기에서 보기" })).toBeInTheDocument();
    expect([...f.store.values()].every((t) => t.purchase_status === "favorite")).toBe(true);
    await userEvent.click(screen.getByRole("tab", { name: "즐겨찾기" }));
    expect(within(items()[0]!).getByText("000719")).toBeInTheDocument();
  });

  it("검색(번호·회차)·복권 필터, 연금 000719 복사는 문자열 그대로", async () => {
    const f = setup({ tickets: [FAV_PENSION, FAV_LOTTO] });
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={f.navigate} />);
    await screen.findByText("000719");
    expect(items()).toHaveLength(2);
    fireEvent.change(screen.getByRole("textbox", { name: "번호·회차로 찾기" }), { target: { value: "0007" } });
    expect(items()).toHaveLength(1);
    fireEvent.change(screen.getByRole("textbox", { name: "번호·회차로 찾기" }), { target: { value: "9 42" } });
    expect(items()).toHaveLength(1);
    expect(within(items()[0]!).getByRole("img", { name: "42번" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "번호·회차로 찾기" }), { target: { value: "" } });
    await userEvent.click(screen.getByRole("radio", { name: "연금" }));
    expect(items()).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "연금복권 720+ 1조 000719 메뉴" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "복사" }));
    expect(f.writeText).toHaveBeenCalledWith("1조 000719");
    await act(async () => {});
    expect(screen.getByText("복사했어요")).toBeInTheDocument();
  });

  it("QR 등록은 보이지 않고, 구매 등록·당첨 확인·설정 링크가 있다", async () => {
    const f = setup();
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={f.navigate} />);
    await screen.findByText("즐겨찾기한 번호가 없습니다");
    expect(screen.queryByText(/QR/)).toBeNull();
    expect(screen.getByRole("link", { name: "구매 등록" })).toHaveAttribute("href", "#/tickets/register");
    expect(screen.getByRole("link", { name: "당첨 확인" })).toHaveAttribute("href", "#/tickets/check");
    expect(screen.getByRole("link", { name: "설정" })).toHaveAttribute("href", "#/settings");
  });
});
