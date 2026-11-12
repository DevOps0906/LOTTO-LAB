import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DrawDetail } from "../src";
import { FETCHED, LOTTO, PENSION, mockCore, ok } from "./screen-core";

const links = {
  home: "#/",
  tickets: "#/tickets",
  list: (game: "lotto" | "pension") => `#/draws?game=${game}`,
  detail: (game: "lotto" | "pension", round: number) => `#/draws/${game}/${round}`,
};
const LOTTO_PRIZES = [
  { rank: 2, bonus: false, amount_won: 55000000, winners: 8, payout: "lump" },
  { rank: 1, bonus: false, amount_won: 2000000000, winners: 1, payout: "lump" },
];
const PENSION_PRIZES = [
  { rank: 1, bonus: false, amount_won: 7000000, winners: 1, payout: "annuity", months: 240 },
  { rank: null, bonus: true, amount_won: 1000000, winners: 10, payout: "annuity", months: 120 },
];

/** 표는 표(768~)·카드(~767) 두 벌이 DOM에 있다 — 표 쪽만 본다. */
function tableRows() {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
}

describe("M-11 회차 상세", () => {
  it("로딩: 불러오는 중 알림", () => {
    const m = mockCore();
    m.drawByRound.mockReturnValue(new Promise(() => {}));
    render(<DrawDetail core={m.core} game="lotto" round={1132} links={links} />);
    expect(screen.getByText("회차 결과를 불러오는 중입니다")).toBeInTheDocument();
  });

  it("로또: 추첨일·번호·보너스, 등위표(일치 기준·1인 당첨금 천 단위·당첨자 수), 출처 링크·검증 시각", async () => {
    const m = mockCore();
    m.drawByRound.mockResolvedValue(ok({ ...LOTTO, prizes: LOTTO_PRIZES }));
    render(<DrawDetail core={m.core} game="lotto" round={1132} links={links} />);
    expect(await screen.findByText(/추첨일 2026\. 11\. 07\./)).toBeInTheDocument();
    expect(m.drawByRound).toHaveBeenCalledWith("lotto", 1132, { force: false });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("로또 6/45 제 1,132회");
    expect(screen.getAllByRole("img").map((b) => b.getAttribute("aria-label"))).toEqual([
      "7번", "12번", "18번", "27번", "34번", "40번", "보너스 41번",
    ]);
    expect(tableRows()).toEqual([
      ["1등", "6개 번호 일치", "2,000,000,000원", "1명"],
      ["2등", "5개 번호 + 보너스 번호 일치", "55,000,000원", "8명"],
    ]);
    expect(screen.getByText("www.dhlottery.co.kr 공개 결과")).toBeInTheDocument();
    expect(document.querySelector(".ll-updated time")).toHaveAttribute("dateTime", LOTTO.source_verified_at);
    await userEvent.click(screen.getByRole("button", { name: "공식 결과 보기" }));
    expect(m.open).toHaveBeenCalledWith(LOTTO.source_url);
    // 이전/다음 회차: 최신 회차(1132)면 다음 없음
    expect(screen.getByRole("link", { name: "이전 회차" })).toHaveAttribute("href", "#/draws/lotto/1131");
    expect(screen.queryByRole("link", { name: "다음 회차" })).toBeNull();
    expect(screen.getByText("수집된 최신 회차입니다")).toBeInTheDocument();
  });

  it("연금: 조·6자리 문자열(000719)·보너스 분리, 연금식은 월 지급액 × 개월", async () => {
    const m = mockCore();
    m.drawByRound.mockResolvedValue(ok({ ...PENSION, draw_no: 280, prizes: PENSION_PRIZES }));
    render(<DrawDetail core={m.core} game="pension" round={280} links={links} />);
    expect(await screen.findByText("000719")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "당첨 번호 3조 000719, 보너스 123456" })).toBeInTheDocument();
    expect(tableRows()).toEqual([
      ["1등", "조 + 6자리 모두 일치", "월 7,000,000원 × 240개월", "1명"],
      ["보너스", "보너스 6자리 일치(조 무관)", "월 1,000,000원 × 120개월", "10명"],
    ]);
    expect(screen.getByRole("link", { name: "다음 회차" })).toHaveAttribute("href", "#/draws/pension/281");
  });

  it("빈: 0행이면 미갱신 안내, 당첨금이 없으면 표 대신 안내", async () => {
    const m = mockCore();
    m.drawByRound.mockResolvedValueOnce(ok(null));
    const { unmount } = render(<DrawDetail core={m.core} game="lotto" round={1200} links={links} />);
    expect(await screen.findByText("제 1,200회 결과가 아직 없습니다")).toBeInTheDocument();
    expect(screen.getByText(/수집되지 않았습니다\(미갱신\)/)).toBeInTheDocument();
    unmount();
    render(<DrawDetail core={m.core} game="lotto" round={1} links={links} />);
    expect(await screen.findByText("공개된 당첨금 정보가 아직 없습니다(미갱신).")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "이전 회차" })).toBeNull();
  });

  it("오류: 캐시 없이 실패하면 결과 미제공 + 다시 시도(force) / stale은 마지막 정상본 + 배너", async () => {
    const m = mockCore();
    m.drawByRound.mockResolvedValueOnce({ data: null, fetched_at: null, stale: true, error: "NETWORK" });
    m.drawByRound.mockResolvedValueOnce({ data: LOTTO, fetched_at: FETCHED, stale: true, error: "NETWORK" });
    render(<DrawDetail core={m.core} game="lotto" round={1132} links={links} />);
    expect(await screen.findByText("회차 결과를 불러오지 못했습니다")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("서버에 연결하지 못해 마지막으로 받은 정보를 보여 줍니다.")).toBeInTheDocument();
    expect(m.drawByRound).toHaveBeenLastCalledWith("lotto", 1132, { force: true });
    expect(document.querySelector(".ll-updated time")).toHaveAttribute("dateTime", LOTTO.source_verified_at);
  });

  it("잘못된 회차 주소는 안내", () => {
    const m = mockCore();
    render(<DrawDetail core={m.core} game="lotto" round={null} links={links} />);
    expect(screen.getByText("회차 번호가 올바르지 않습니다")).toBeInTheDocument();
    expect(m.drawByRound).not.toHaveBeenCalled();
  });
});
