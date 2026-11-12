// D-01 Windows 대시보드: M-01 블록 재사용 + 지난 회차 결과(공식 결과·회차별 내 구매 기록 수).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Dashboard, RECENT_DRAWS, type DashboardLinks } from "../src";
import { LOTTO, mockCore, ok } from "./screen-core";

const links = {
  generate: "#/lotto",
  lotto: "#/lotto",
  pension: "#/pension",
  lottoLast: "#/lotto?from=last",
  pensionLast: "#/pension?from=last",
  stats: "#/stats",
  tickets: "#/tickets",
  settings: "#/settings",
  draws: "#/draws",
  register: "#/tickets/register",
};
const PREV = { ...LOTTO, draw_no: 1131, draw_date: "2026-10-31", nums: [3, 9, 14, 25, 33, 42], bonus: 17 };

function cols(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(".ll-home__grid > .ll-home__col"));
}
function recentCard() {
  return screen.getByRole("heading", { name: "지난 회차 결과" }).closest("section")!;
}

describe("D-01 Windows 대시보드", () => {
  it("제목 대시보드, 히어로 전폭 → 좌[최신 회차·상품 카드·지난 회차 결과] | 우[통계 요약·CTA·내 기록]", () => {
    const m = mockCore();
    const { container } = render(<Dashboard core={m.core} links={links} />);
    expect(screen.getByRole("heading", { level: 1, name: "대시보드" })).toBeInTheDocument();
    expect(container.querySelector(".ll-home > .ll-hero")).toBeInTheDocument();
    const [left, right] = cols(container);
    expect(within(left!).getByRole("heading", { name: "최신 회차" })).toBeInTheDocument();
    expect(within(left!).getByRole("link", { name: /로또 6\/45/ })).toHaveAttribute("href", "#/lotto");
    expect(within(left!).getByRole("link", { name: /연금복권 720\+/ })).toHaveAttribute("href", "#/pension");
    expect(within(left!).getByRole("heading", { name: "지난 회차 결과" })).toBeInTheDocument();
    expect(within(right!).getByRole("heading", { name: "이번 주 통계 요약" })).toBeInTheDocument();
    expect(within(right!).getByRole("link", { name: /번호 생성하기/ })).toHaveAttribute("href", "#/lotto");
    expect(within(right!).getByRole("heading", { name: "내 기록" })).toBeInTheDocument();
    expect(m.listDraws).toHaveBeenCalledWith("lotto", { limit: RECENT_DRAWS, force: false });
  });

  it("로딩: 지난 회차 결과 스켈레톤", () => {
    const m = mockCore();
    render(<Dashboard core={m.core} links={links} />);
    expect(screen.getByText("지난 회차 결과를 불러오는 중입니다")).toBeInTheDocument();
    expect(recentCard()).toHaveAttribute("aria-busy", "true");
  });

  it("빈: 기록 없음 → 번호 생성·구매 등록 CTA", async () => {
    const m = mockCore();
    render(<Dashboard core={m.core} links={links} />);
    expect(await screen.findByText("아직 저장한 번호가 없습니다")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "번호 생성하기" }).some((a) => a.classList.contains("ll-button"))).toBe(true);
    expect(screen.getByRole("link", { name: "구매 등록하기" })).toHaveAttribute("href", "#/tickets/register");
  });

  it("성공: 회차별 당첨 번호·출처, 구매 등록한 번호만 구매 기록 수로 센다(즐겨찾기·다른 복권 제외)", async () => {
    const m = mockCore();
    m.listDraws.mockResolvedValue(ok([LOTTO, PREV]));
    m.list.mockResolvedValue([
      { game: "lotto", purchase_status: "purchased", round: 1132 },
      { game: "lotto", purchase_status: "purchased", round: 1132 },
      { game: "lotto", purchase_status: "favorite", round: 1131 },
      { game: "pension", purchase_status: "purchased", round: 1131 },
    ]);
    render(<Dashboard core={m.core} links={links} />);
    const card = recentCard();
    expect(await within(card).findByText("구매 기록 2")).toHaveAttribute("data-status", "purchased");
    const rows = card.querySelectorAll<HTMLElement>(".ll-recent__row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("제 1,132회");
    expect(rows[1]).toHaveTextContent("구매 기록 없음");
    expect(card.querySelectorAll(".ll-recent__row .ll-ball")).toHaveLength(14);
    expect(within(card).getByRole("link", { name: "회차 목록" })).toHaveAttribute("href", "#/draws");
    expect(card).toHaveTextContent("www.dhlottery.co.kr 공개 결과");
  });

  it("오류: 지난 회차 결과를 못 읽으면 안내 + 다시 시도(강제 새로고침)", async () => {
    const m = mockCore();
    m.listDraws.mockResolvedValueOnce({ data: null, fetched_at: null, stale: false, error: "NETWORK" });
    render(<Dashboard core={m.core} links={links} />);
    expect(await screen.findByText("지난 회차 결과를 불러오지 못했습니다")).toBeInTheDocument();
    await userEvent.click(within(recentCard()).getByRole("button", { name: "다시 시도" }));
    expect(await within(recentCard()).findByText("제 1,132회")).toBeInTheDocument();
    expect(m.listDraws).toHaveBeenLastCalledWith("lotto", { limit: RECENT_DRAWS, force: true });
  });

  it("내 기록 읽기 실패: 구매 기록 배지·없음 문구를 숨기고 확인 불가 안내(0건과 구분)", async () => {
    const m = mockCore();
    m.listDraws.mockResolvedValue(ok([LOTTO, PREV]));
    m.list.mockRejectedValue(new Error("io"));
    render(<Dashboard core={m.core} links={links} />);
    const card = recentCard();
    expect(await within(card).findByText(/구매 기록을 확인할 수 없어요/)).toBeInTheDocument();
    expect(card.querySelectorAll(".ll-recent__row")).toHaveLength(2);
    expect(within(card).queryByText(/구매 기록 \d/)).toBeNull();
    expect(within(card).queryByText("구매 기록 없음")).toBeNull();
  });

  it("내 기록 성공·0건이면 확인 불가 안내 없이 '구매 기록 없음'", async () => {
    const m = mockCore();
    render(<Dashboard core={m.core} links={links} />);
    const card = recentCard();
    expect(await within(card).findByText("구매 기록 없음")).toBeInTheDocument();
    expect(within(card).queryByText(/구매 기록을 확인할 수 없어요/)).toBeNull();
  });

  it("준비 중 화면 링크(통계·내 번호·회차·구매 등록)를 넘기지 않으면 바로가기를 숨긴다", async () => {
    const m = mockCore();
    const ready = Object.fromEntries(
      Object.entries(links).filter(([key]) => !["stats", "tickets", "draws", "register"].includes(key)),
    ) as DashboardLinks;
    const { container } = render(<Dashboard core={m.core} links={ready} />);
    expect(await screen.findByText("아직 저장한 번호가 없습니다")).toBeInTheDocument();
    expect(await within(recentCard()).findByText("제 1,132회")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "구매 등록하기" })).toBeNull();
    expect(screen.queryByRole("link", { name: "내 번호 보기" })).toBeNull();
    expect(screen.queryByRole("link", { name: "통계 자세히 보기" })).toBeNull();
    expect(screen.queryByRole("link", { name: "회차 목록" })).toBeNull();
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.every((h) => h === null || !/^#\/(stats|tickets|draws)/.test(h))).toBe(true);
  });

  it("미갱신: 회차가 없으면 미수집 안내", async () => {
    const m = mockCore();
    m.listDraws.mockResolvedValue(ok([]));
    render(<Dashboard core={m.core} links={links} />);
    expect(await within(recentCard()).findByText(/아직 수집되지 않았습니다/)).toBeInTheDocument();
  });
});
