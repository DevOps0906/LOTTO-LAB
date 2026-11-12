// D-14 Windows 회차 목록 = M-16 DrawList layout="wide": 넓은 표(회차·추첨일·번호·출처·검증 시각·상태), 행 상세 링크, 복권 선택을 셸에 알린다.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DrawList } from "../src";
import { LOTTO, PENSION, mockCore, ok } from "./screen-core";

const links = {
  home: "#/",
  stats: "#/stats",
  detail: (game: "lotto" | "pension", round: number) => `#/draws/${game}/${round}`,
};

describe("D-14 Windows 회차 목록(M-16 wide)", () => {
  it("표: 최신 회차부터, 행 상세 링크·추첨일·번호·출처·검증 시각·상태, 이동 경로 없음", async () => {
    const m = mockCore();
    m.listDraws.mockResolvedValue(ok([LOTTO, { ...LOTTO, draw_no: 1131 }]));
    const { container } = render(<DrawList core={m.core} links={links} navigate={vi.fn()} layout="wide" />);
    const region = await screen.findByRole("region", { name: "로또 6/45 회차 표 영역(가로 스크롤)" });
    expect(container.querySelector(".ll-draws")).toHaveAttribute("data-layout", "wide");
    expect(screen.queryByRole("navigation", { name: "현재 위치" })).toBeNull();
    const table = within(region).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["회차", "추첨일", "당첨 번호", "출처 · 검증 시각", "상태"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByRole("link").getAttribute("href"))).toEqual(["#/draws/lotto/1132", "#/draws/lotto/1131"]);
    expect(within(rows[0]!).getByRole("link")).toHaveAccessibleName("제 1,132회 상세 보기");
    expect(within(rows[0]!).getByText("www.dhlottery.co.kr 공개 결과")).toBeInTheDocument();
    expect(rows[0]!.querySelector(".ll-updated time")).toHaveAttribute("dateTime", LOTTO.source_verified_at);
    expect(within(rows[0]!).getByText("검증 완료")).toBeInTheDocument();
    // 카드 목록은 그리지 않는다(한 벌만)
    expect(container.querySelector(".ll-draws__items")).toBeNull();
  });

  it("연금은 6자리 문자열 그대로(000719), 복권을 바꾸면 셸에 알린다(검색 상태 복원)", async () => {
    const m = mockCore();
    const onGameChange = vi.fn();
    render(<DrawList core={m.core} links={links} navigate={vi.fn()} layout="wide" onGameChange={onGameChange} />);
    await screen.findByRole("region", { name: "로또 6/45 회차 표 영역(가로 스크롤)" });
    await userEvent.click(screen.getByRole("radio", { name: "연금복권 720+" }));
    expect(onGameChange).toHaveBeenCalledWith("pension");
    const region = await screen.findByRole("region", { name: "연금복권 720+ 회차 표 영역(가로 스크롤)" });
    expect(within(region).getByText(PENSION.digits)).toBeInTheDocument();
  });

  it("처음 복권(initialGame)으로 복원해 연다", async () => {
    const m = mockCore();
    render(<DrawList core={m.core} links={links} navigate={vi.fn()} layout="wide" initialGame="pension" />);
    expect(await screen.findByRole("region", { name: "연금복권 720+ 회차 표 영역(가로 스크롤)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "연금복권 720+" })).toBeChecked();
  });

  it("빈 목록: 미갱신 안내", async () => {
    const m = mockCore();
    m.listDraws.mockResolvedValue(ok([]));
    render(<DrawList core={m.core} links={links} navigate={vi.fn()} layout="wide" />);
    expect(await screen.findByText("로또 6/45 회차 결과가 아직 없습니다")).toBeInTheDocument();
  });
});
