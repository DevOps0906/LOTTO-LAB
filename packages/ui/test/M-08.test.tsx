import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TicketCheck, TicketDetail, type TicketOutcome, type TicketRecord } from "../src";
import { fakeTicketsCore, favorite, purchased, renderWithNotice } from "./ticket-core";

const checkLinks = { tickets: "#/tickets?tab=purchased", register: "#/tickets/register", detail: (id: string) => `#/tickets/${id}` };
const detailLinks = {
  tickets: "#/tickets",
  registerFrom: (id: string) => `#/tickets/register?ticket=${id}`,
  drawDetail: (game: "lotto" | "pension", round: number) => `#/draws/${game}/${round}`,
};

const LOTTO_WIN = purchased({ game: "lotto", ticket_data: { nums: [1, 2, 3, 4, 5, 7] }, round: 1132 });
const LOTTO_LOSE = purchased({ game: "lotto", ticket_data: { nums: [40, 41, 42, 43, 44, 45] }, round: 1132 });
const PENSION_BONUS = purchased({ game: "pension", ticket_data: { group_no: 1, digits: "000719" }, round: 290, amount_won: 1000 });
const NO_ROUND = purchased({ game: "pension", ticket_data: { group_no: 3, digits: "012345" }, round: null });
const FUTURE = purchased({ game: "lotto", ticket_data: { nums: [10, 11, 12, 13, 14, 15] }, round: 1133 });

function checked(t: TicketRecord, rank: number | null, bonus: boolean, stale = false): TicketOutcome {
  return {
    ticket: t,
    status: "checked",
    draw_no: t.round!,
    result: { matched_rank: rank, bonus_hit: bonus },
    source_url: `https://www.dhlottery.co.kr/${t.game}/${t.round}`,
    source_verified_at: "2026-11-07T12:05:00.000Z",
    fetched_at: "2026-11-12T02:00:00.000Z",
    stale,
  };
}

function judgeAll(t: TicketRecord): TicketOutcome {
  if (t.round === null) return { ticket: t, status: "no_round" };
  if (t.id === LOTTO_WIN.id) return checked(t, 2, false);
  if (t.id === LOTTO_LOSE.id) return checked(t, null, false);
  if (t.id === PENSION_BONUS.id) return checked(t, 1, true);
  return { ticket: t, status: "pending", stale: false };
}

describe("M-08 당첨 확인", () => {
  it("구매 기록만 회차별로: 등위·낙첨·연금 보너스 별도·추첨 전·회차 미입력, 출처·검증·조회 시각, 공식 결과 재확인 안내", async () => {
    const f = fakeTicketsCore({ tickets: [LOTTO_WIN, LOTTO_LOSE, PENSION_BONUS, NO_ROUND, FUTURE, favorite({ game: "lotto", ticket_data: { nums: [1, 2, 3, 4, 5, 6] } })] });
    f.judge.mockImplementation(judgeAll);
    renderWithNotice(<TicketCheck core={f.core} links={checkLinks} />);
    expect(await screen.findByText("2등")).toBeInTheDocument();
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".ll-tickets__group"));
    // 회차 미입력 먼저 → 로또 최신 회차 순 → 연금
    expect(cards.map((c) => c.querySelector(".ll-card__title")?.textContent)).toEqual([
      "연금복권 720+ · 회차 미입력",
      "로또 6/45 제 1,133회",
      "로또 6/45 제 1,132회",
      "연금복권 720+ 제 290회",
    ]);
    expect(within(cards[0]!).getByText("회차를 입력하세요")).toBeInTheDocument();
    expect(within(cards[1]!).getByText("추첨 전")).toBeInTheDocument();
    expect(within(cards[2]!).getByText("낙첨")).toBeInTheDocument();
    expect(within(cards[3]!).getByText("1등")).toBeInTheDocument();
    expect(within(cards[3]!).getByText("보너스 일치")).toBeInTheDocument();
    expect(within(cards[3]!).getByText("000719")).toBeInTheDocument();
    expect(within(cards[2]!).getByText("www.dhlottery.co.kr 공개 결과")).toBeInTheDocument();
    expect(within(cards[2]!).getByText(/조회/)).toBeInTheDocument();
    expect(screen.getByText("공식 결과로 다시 확인")).toBeInTheDocument();
    // 즐겨찾기는 대조 대상 아님(행 6개 중 5개만)
    expect(document.querySelectorAll(".ll-tickets__item")).toHaveLength(5);
    await userEvent.click(within(cards[2]!).getByRole("button", { name: "공식 결과 보기" }));
    expect(f.open).toHaveBeenCalledWith("https://www.dhlottery.co.kr/lotto/1132");
  });

  it("회차 미입력 → 회차 입력 저장 후 다시 대조, 잘못된 값은 필드 옆 안내", async () => {
    const f = fakeTicketsCore({ tickets: [NO_ROUND] });
    renderWithNotice(<TicketCheck core={f.core} links={checkLinks} />);
    const input = await screen.findByRole("textbox", { name: "구매한 회차를 입력하세요" });
    await userEvent.click(screen.getByRole("button", { name: "회차 저장" }));
    expect(screen.getByText(/1 이상의 회차 번호/)).toHaveAttribute("role", "alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(input, "291");
    await userEvent.click(screen.getByRole("button", { name: "회차 저장" }));
    await waitFor(() => expect(f.tickets.setRound).toHaveBeenCalledWith(NO_ROUND.id, 291));
    expect(await screen.findByText("연금복권 720+ 제 291회")).toBeInTheDocument();
    expect(f.checkPurchased).toHaveBeenCalledTimes(2);
  });

  it("stale(마지막 정상본) 배너와 다시 확인(force)", async () => {
    const f = fakeTicketsCore({ tickets: [LOTTO_LOSE] });
    f.judge.mockImplementation((t) => checked(t, null, false, true));
    renderWithNotice(<TicketCheck core={f.core} links={checkLinks} />);
    expect(await screen.findByText("서버에 연결하지 못해 마지막으로 받은 정보를 보여 줍니다.")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "다시 확인" })[0]!);
    await waitFor(() => expect(f.checkPurchased).toHaveBeenLastCalledWith(undefined, { force: true }));
  });

  it("빈 상태(구매 기록 없음 → 구매 등록)·오류 상태", async () => {
    const f = fakeTicketsCore({ tickets: [favorite({ game: "lotto", ticket_data: { nums: [1, 2, 3, 4, 5, 6] } })] });
    const { unmount } = renderWithNotice(<TicketCheck core={f.core} links={checkLinks} />);
    expect(await screen.findByText("확인할 구매 기록이 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "구매 등록" })).toHaveAttribute("href", "#/tickets/register");
    unmount();
    f.checkPurchased.mockRejectedValueOnce(new Error("io"));
    renderWithNotice(<TicketCheck core={f.core} links={checkLinks} />);
    expect(await screen.findByText("당첨 결과를 확인하지 못했습니다")).toBeInTheDocument();
  });
});

describe("M-08 내 번호 상세", () => {
  it("구매 기록: 조·번호(000719)·등록 출처·구매일·금액(원), 판정, 공식 회차 상세 링크", async () => {
    const f = fakeTicketsCore({ tickets: [PENSION_BONUS] });
    f.judge.mockImplementation(judgeAll);
    renderWithNotice(<TicketDetail core={f.core} ticketId={PENSION_BONUS.id} links={detailLinks} navigate={vi.fn()} />);
    expect(await screen.findByText("1등")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("연금복권 720+ 제 290회");
    expect(screen.getAllByText("000719").length).toBeGreaterThan(0);
    expect(screen.getByText("직접 입력")).toBeInTheDocument();
    expect(screen.getByText("2026-11-10")).toBeInTheDocument();
    expect(screen.getByText("1,000원")).toBeInTheDocument();
    expect(screen.getByText("보너스 일치")).toBeInTheDocument();
    expect(screen.getByText("www.dhlottery.co.kr 공개 결과")).toBeInTheDocument();
    expect(screen.getAllByText(/조회/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "공식 회차 상세 보기" })).toHaveAttribute("href", "#/draws/pension/290");
    await userEvent.click(screen.getByRole("button", { name: "복사" }));
    expect(f.writeText).toHaveBeenCalledWith("1조 000719");
  });

  it("즐겨찾기: 대조하지 않고 '구매로 등록' 안내", async () => {
    const fav = favorite({ game: "lotto", ticket_data: { nums: [1, 2, 3, 4, 5, 6] }, source_number_id: "00000000-0000-4000-8000-0000000000aa" });
    const f = fakeTicketsCore({ tickets: [fav] });
    renderWithNotice(<TicketDetail core={f.core} ticketId={fav.id} links={detailLinks} navigate={vi.fn()} />);
    expect(await screen.findByText(/구매하지 않은 번호는 당첨 확인 대상이 아닙니다/)).toBeInTheDocument();
    expect(screen.getByText("추천 번호에서 저장")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "구매로 등록" })).toHaveAttribute("href", `#/tickets/register?ticket=${fav.id}`);
    expect(f.checkTicket).not.toHaveBeenCalled();
    expect(document.querySelector("[data-result]")).toBeNull();
  });

  it("구매 기록 삭제: AlertDialog 확인 → 목록으로 이동 + 스낵바 실행 취소, 없는 id는 안내", async () => {
    const f = fakeTicketsCore({ tickets: [LOTTO_LOSE] });
    const navigate = vi.fn();
    const { unmount } = renderWithNotice(<TicketDetail core={f.core} ticketId={LOTTO_LOSE.id} links={detailLinks} navigate={navigate} />);
    await userEvent.click(await screen.findByRole("button", { name: "삭제" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("되돌릴 수 없어요");
    expect(f.tickets.remove).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "삭제" }));
    expect(navigate).toHaveBeenCalledWith("#/tickets");
    expect(await screen.findByText("구매 기록을 삭제했어요")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    await waitFor(() => expect(f.tickets.restore).toHaveBeenCalledWith(LOTTO_LOSE));
    unmount();
    renderWithNotice(<TicketDetail core={f.core} ticketId="missing" links={detailLinks} navigate={navigate} />);
    expect(await screen.findByText("번호를 찾을 수 없습니다")).toBeInTheDocument();
  });
});
