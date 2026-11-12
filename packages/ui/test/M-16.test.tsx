import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DrawList } from "../src";
import { FETCHED, LOTTO, PENSION, mockCore, ok } from "./screen-core";

const links = {
  home: "#/",
  stats: "#/stats",
  detail: (game: "lotto" | "pension", round: number) => `#/draws/${game}/${round}`,
};
const page = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ ...LOTTO, draw_no: from - i }));

describe("M-16 회차 목록", () => {
  it("로딩: 불러오는 중 알림", () => {
    const m = mockCore();
    m.listDraws.mockReturnValue(new Promise(() => {}));
    render(<DrawList core={m.core} links={links} navigate={vi.fn()} />);
    expect(screen.getByText("회차 목록을 불러오는 중입니다")).toBeInTheDocument();
  });

  it("성공: 최신 회차부터 회차·추첨일·번호·검증 상태·출처·검증 시각·상세 링크", async () => {
    const m = mockCore();
    m.listDraws.mockResolvedValue(ok(page(1132, 3)));
    render(<DrawList core={m.core} links={links} navigate={vi.fn()} />);
    const list = await screen.findByRole("region", { name: "로또 6/45 회차 목록" });
    expect(m.listDraws).toHaveBeenCalledWith("lotto", { force: false, limit: 20 });
    const items = within(list).getAllByRole("listitem").filter((li) => li.classList.contains("ll-draws__item"));
    expect(items.map((li) => within(li).getByRole("link").getAttribute("href"))).toEqual([
      "#/draws/lotto/1132",
      "#/draws/lotto/1131",
      "#/draws/lotto/1130",
    ]);
    const first = items[0]!;
    expect(within(first).getByText("검증 완료")).toBeInTheDocument();
    expect(within(first).getByText("www.dhlottery.co.kr 공개 결과")).toBeInTheDocument();
    expect(first.querySelector(".ll-updated time")).toHaveAttribute("dateTime", LOTTO.source_verified_at);
    expect(within(first).getAllByRole("img").map((b) => b.getAttribute("aria-label"))).toContain("보너스 41번");
    // 마지막 페이지(20개 미만)면 더 보기 없음
    expect(within(list).getByText("수집된 가장 이전 회차까지 모두 표시했습니다.")).toBeInTheDocument();
  });

  it("더 보기: before = 마지막 회차로 다음 페이지, 실패하면 그 자리에서 안내", async () => {
    const m = mockCore();
    m.listDraws.mockResolvedValueOnce(ok(page(1132, 20)));
    m.listDraws.mockResolvedValueOnce({ data: null, fetched_at: null, stale: true, error: "NETWORK" });
    m.listDraws.mockResolvedValueOnce(ok(page(1112, 5)));
    render(<DrawList core={m.core} links={links} navigate={vi.fn()} />);
    const more = await screen.findByRole("button", { name: "이전 회차 더 보기" });
    await userEvent.click(more);
    expect(m.listDraws).toHaveBeenLastCalledWith("lotto", { before: 1113, limit: 20 });
    expect(await screen.findByText("이전 회차를 불러오지 못했습니다. 연결을 확인한 뒤 다시 눌러 주세요.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "이전 회차 더 보기" }));
    expect(await screen.findByText("수집된 가장 이전 회차까지 모두 표시했습니다.")).toBeInTheDocument();
    expect(screen.getByText(/25개 회차 표시 중/)).toBeInTheDocument();
  });

  it("연금: 조·6자리 문자열(앞자리 0 보존)·보너스 분리", async () => {
    const m = mockCore();
    render(<DrawList core={m.core} links={links} navigate={vi.fn()} initialGame="pension" />);
    expect(await screen.findByText("000719")).toBeInTheDocument();
    expect(screen.getByText("3조")).toBeInTheDocument();
    expect(screen.getByText(PENSION.bonus_digits)).toBeInTheDocument();
    expect(m.listDraws).toHaveBeenCalledWith("pension", { force: false, limit: 20 });
  });

  it("빈: 0행이면 미갱신 안내", async () => {
    const m = mockCore();
    m.listDraws.mockResolvedValue(ok([]));
    render(<DrawList core={m.core} links={links} navigate={vi.fn()} />);
    expect(await screen.findByText("로또 6/45 회차 결과가 아직 없습니다")).toBeInTheDocument();
    expect(screen.getByText(/미갱신/)).toBeInTheDocument();
  });

  it("오류: 캐시 없이 실패하면 결과 미제공 + 다시 시도(force) / stale은 배너", async () => {
    const m = mockCore();
    m.listDraws.mockResolvedValueOnce({ data: null, fetched_at: null, stale: true, error: "HTTP" });
    m.listDraws.mockResolvedValueOnce({ data: [LOTTO], fetched_at: FETCHED, stale: true, error: "NETWORK" });
    render(<DrawList core={m.core} links={links} navigate={vi.fn()} />);
    expect(await screen.findByText("회차 목록을 불러오지 못했습니다")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("서버에 연결하지 못해 마지막으로 받은 정보를 보여 줍니다.")).toBeInTheDocument();
    expect(m.listDraws).toHaveBeenLastCalledWith("lotto", { force: true, limit: 20 });
  });

  it("회차 찾기: 숫자면 상세로 이동, 아니면 입력 오류", async () => {
    const m = mockCore();
    const navigate = vi.fn();
    render(<DrawList core={m.core} links={links} navigate={navigate} />);
    const input = screen.getByLabelText("회차 번호로 찾기");
    await userEvent.type(input, "abc{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("1 이상의 회차 번호");
    expect(input).toHaveAttribute("aria-invalid", "true");
    await userEvent.clear(input);
    await userEvent.type(input, "0{Enter}");
    expect(navigate).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.type(input, "1000{Enter}");
    expect(navigate).toHaveBeenCalledWith("#/draws/lotto/1000");
  });

  it("복권 전환: 연금 목록을 새로 읽는다", async () => {
    const m = mockCore();
    render(<DrawList core={m.core} links={links} navigate={vi.fn()} />);
    await screen.findByRole("region", { name: "로또 6/45 회차 목록" });
    await userEvent.click(screen.getByRole("radio", { name: "연금복권 720+" }));
    await waitFor(() => expect(m.listDraws).toHaveBeenLastCalledWith("pension", { force: false, limit: 20 }));
    expect(await screen.findByRole("region", { name: "연금복권 720+ 회차 목록" })).toBeInTheDocument();
  });
});
