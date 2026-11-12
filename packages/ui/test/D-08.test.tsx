// D-08 Windows 회차 상세 = M-11 DrawDetail layout="wide": 당첨 번호(좌)·등위별 당첨금(우), 이동 경로 회차 목록 › 상세.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DrawDetail } from "../src";
import { PENSION, mockCore, ok } from "./screen-core";

const links = {
  home: "#/",
  tickets: "#/tickets/check",
  list: (game: "lotto" | "pension") => `#/draws?game=${game}`,
  detail: (game: "lotto" | "pension", round: number) => `#/draws/${game}/${round}`,
};

describe("D-08 Windows 회차 상세(M-11 wide)", () => {
  it("2열[당첨 번호 | 등위별 당첨금], 연금 000719·보너스 분리, 출처·검증 시각, 이전/다음, 구매번호 확인", async () => {
    const m = mockCore();
    m.drawByRound.mockResolvedValue(
      ok({ ...PENSION, draw_no: 289, prizes: [{ rank: 1, bonus: false, amount_won: 7_000_000, winners: 1, payout: "annuity", months: 240 }] }),
    );
    const { container } = render(<DrawDetail core={m.core} game="pension" round={289} links={links} layout="wide" />);
    await screen.findByText(/추첨일 /);
    const cols = container.querySelector(".ll-draws__cols") as HTMLElement;
    expect(cols.children).toHaveLength(2);
    expect(within(cols.children[0] as HTMLElement).getByRole("heading", { name: "당첨 번호" })).toBeInTheDocument();
    expect(within(cols.children[1] as HTMLElement).getByRole("heading", { name: "등위별 당첨금" })).toBeInTheDocument();
    expect(within(cols).getByRole("group", { name: "당첨 번호 3조 000719, 보너스 123456" })).toBeInTheDocument();
    expect(within(cols).getByText("www.dhlottery.co.kr 공개 결과")).toBeInTheDocument();
    const crumb = screen.getByRole("navigation", { name: "현재 위치" });
    expect(within(crumb).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["회차 목록", "회차 상세"]);
    expect(within(crumb).getByRole("link", { name: "회차 목록" })).toHaveAttribute("href", "#/draws?game=pension");
    expect(screen.getByRole("link", { name: "이전 회차" })).toHaveAttribute("href", "#/draws/pension/288");
    expect(screen.getByRole("link", { name: "다음 회차" })).toHaveAttribute("href", "#/draws/pension/290");
    expect(screen.getByRole("link", { name: "내 번호에서 확인하기" })).toHaveAttribute("href", "#/tickets/check");
  });

  it("미수집 회차: 미갱신 안내 + 회차 목록으로", async () => {
    const m = mockCore();
    m.drawByRound.mockResolvedValue(ok(null));
    render(<DrawDetail core={m.core} game="lotto" round={9999} links={links} layout="wide" />);
    expect(await screen.findByText("제 9,999회 결과가 아직 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "회차 목록으로" })).toHaveAttribute("href", "#/draws?game=lotto");
  });
});
