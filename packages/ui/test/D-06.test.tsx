// D-06 Windows 내 번호 상세 = M-08 TicketDetail layout="wide": 좌[번호·당첨 확인] | 우[이력(생성·저장·구매 등록·대조)], 구매 기록만 판정.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TicketDetail, type TicketOutcome } from "../src";
import { fakeTicketsCore, favorite, history, purchased, renderWithNotice } from "./ticket-core";

const links = {
  tickets: "#/tickets",
  registerFrom: (id: string) => `#/tickets/register?ticket=${id}`,
  drawDetail: (game: "lotto" | "pension", round: number) => `#/draws/${game}/${round}`,
};

const H = { ...history({ game: "pension", group_no: 1, digits: "000719" }), created_at: "2026-11-09T01:00:00.000Z" };

function events(): { event: string | null; text: string }[] {
  const list = screen.getByRole("heading", { name: "이력" }).closest(".ll-card")!.querySelectorAll("li");
  return Array.from(list).map((li) => ({ event: li.getAttribute("data-event"), text: li.textContent ?? "" }));
}

describe("D-06 Windows 내 번호 상세(M-08 wide)", () => {
  it("추천 → 즐겨찾기 → 구매 등록 → 대조 이력, 2열, 연금 000719 그대로, 공유 없음(복사만)", async () => {
    const t = purchased({
      game: "pension",
      ticket_data: { group_no: 1, digits: "000719" },
      round: 290,
      source_number_id: H.id,
      created_at: "2026-11-10T01:00:00.000Z",
      updated_at: "2026-11-11T01:00:00.000Z",
    });
    const f = fakeTicketsCore({ tickets: [t], history: [H] });
    f.judge.mockImplementation(
      (x): TicketOutcome => ({
        ticket: x,
        status: "checked",
        draw_no: 290,
        result: { matched_rank: null, bonus_hit: false },
        source_url: "https://www.dhlottery.co.kr/pension",
        source_verified_at: "2026-11-06T11:40:00.000Z",
        fetched_at: "2026-11-12T02:00:00.000Z",
        stale: false,
      }),
    );
    const { container } = renderWithNotice(
      <TicketDetail core={f.core} ticketId={t.id} links={links} navigate={vi.fn()} layout="wide" canShare={false} />,
    );
    await screen.findByRole("heading", { name: "이력" });
    const cols = container.querySelector(".ll-tickets__cols") as HTMLElement;
    expect(cols.children).toHaveLength(2);
    expect(within(cols.children[0] as HTMLElement).getByRole("heading", { name: "번호" })).toBeInTheDocument();
    expect(within(cols.children[0] as HTMLElement).getByRole("heading", { name: "당첨 확인" })).toBeInTheDocument();
    expect(within(cols.children[1] as HTMLElement).getByRole("heading", { name: "이력" })).toBeInTheDocument();
    expect(events().map((e) => e.event)).toEqual(["generated", "saved", "purchased", "check"]);
    expect(events()[0]!.text).toMatch(/^생성\(추천 번호\)/);
    expect(events()[3]!.text).toMatch(/^대조 · 제 290회 공개 결과/);
    const times = Array.from(container.querySelectorAll(".ll-tickets__history time")).map((x) => x.getAttribute("dateTime"));
    expect(times).toEqual([H.created_at, t.created_at, t.updated_at, "2026-11-12T02:00:00.000Z"]);
    // 헤더에 회차·구매 상태·판정
    const header = screen.getByRole("heading", { level: 1, name: "연금복권 720+ 제 290회" }).closest("header")!;
    expect(within(header).getByText("구매 기록")).toBeInTheDocument();
    expect(within(header).getByText("낙첨")).toBeInTheDocument();
    expect(screen.getAllByText("000719").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "공유" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "복사" }));
    await waitFor(() => expect(f.writeText).toHaveBeenCalledWith("1조 000719"));
  });

  it("즐겨찾기: 대조하지 않는다(미구매 대조 제외) — 이력의 대조는 '대상 아님', 구매로 등록 안내", async () => {
    const t = favorite({ game: "lotto", ticket_data: { nums: [1, 2, 3, 4, 5, 6] }, source_number_id: "00000000-0000-4000-8000-999999999999" });
    const f = fakeTicketsCore({ tickets: [t] });
    renderWithNotice(<TicketDetail core={f.core} ticketId={t.id} links={links} navigate={vi.fn()} layout="wide" />);
    await screen.findByRole("heading", { name: "이력" });
    expect(f.checkTicket).not.toHaveBeenCalled();
    expect(events().map((e) => e.event)).toEqual(["generated", "saved", "check"]);
    expect(events()[0]!.text).toContain("생성 이력이 기기에 남아 있지 않습니다");
    expect(events()[2]!.text).toContain("대상 아님");
    expect(screen.getByRole("link", { name: "구매로 등록" })).toHaveAttribute("href", `#/tickets/register?ticket=${t.id}`);
  });

  it("직접 입력한 구매 기록: 구매 등록(직접 입력) → 대조 대기", async () => {
    const t = purchased({ game: "lotto", ticket_data: { nums: [3, 9, 14, 25, 33, 42] }, round: 1133 });
    const f = fakeTicketsCore({ tickets: [t] });
    renderWithNotice(<TicketDetail core={f.core} ticketId={t.id} links={links} navigate={vi.fn()} layout="wide" />);
    await screen.findByRole("heading", { name: "이력" });
    await waitFor(() => expect(events().map((e) => e.event)).toEqual(["purchased", "check"]));
    expect(events()[0]!.text).toMatch(/^구매 등록\(직접 입력\)/);
    expect(events()[1]!.text).toContain("추첨 전");
  });

  it("없는 번호: 목록으로 안내", async () => {
    const f = fakeTicketsCore();
    renderWithNotice(<TicketDetail core={f.core} ticketId="00000000-0000-4000-8000-000000000999" links={links} navigate={vi.fn()} layout="wide" />);
    expect(await screen.findByText("번호를 찾을 수 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "내 번호로" })).toHaveAttribute("href", "#/tickets");
  });
});
