// D-04 Windows 통계 = M-04 Statistics layout="wide": 이동 경로 없음, 조건 위 한 줄, 차트(좌)·대체 표(우) 함께, 필수 표기 5종.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Statistics } from "../src";
import { LOTTO, mockCore, ok } from "./screen-core";

const links = {
  home: "#/",
  draws: (game: "lotto" | "pension") => `#/draws?game=${game}`,
  detail: (game: "lotto" | "pension", round: number) => `#/draws/${game}/${round}`,
};
const FREQ = Array.from({ length: 45 }, (_, i) => (i * 7) % 11);
const FORBIDDEN = /hot|cold|핫|콜드|순위|확률 상승|당첨 확률이 높은|당첨 보장|많이 나온|적게 나온|추천/i;

describe("D-04 Windows 통계(M-04 wide)", () => {
  it("차트와 대체 표를 함께(토글 없음), 기간·표본·기준선·출처·갱신 시각·미래 예측 아님", async () => {
    const m = mockCore();
    m.statistics.mockResolvedValue(
      ok({
        payload: { baseline: { num: 20, den: 3 }, values: FREQ },
        range_from: 1083,
        range_to: 1132,
        sample_size: 50,
        source: "LOTTO LAB 집계",
        updated_at: "2026-11-07T13:00:00.000Z",
      }),
    );
    const { container } = render(<Statistics core={m.core} links={links} layout="wide" />);
    const p = await screen.findByRole("region", { name: /로또 6\/45 번호별 출현 횟수$/ });
    expect(container.querySelector(".ll-stats")).toHaveAttribute("data-layout", "wide");
    expect(screen.queryByRole("navigation", { name: "현재 위치" })).toBeNull();
    expect(within(p).queryByRole("button", { name: "표로 보기" })).toBeNull();
    // 차트(좌)·표(우)
    const split = p.querySelector(".ll-stats__split") as HTMLElement;
    expect(within(split).getByRole("img", { name: /막대 차트/ })).toBeInTheDocument();
    const tableRegion = within(split).getByRole("region", { name: /대체 표 영역/ });
    expect(tableRegion).toHaveAttribute("tabindex", "0");
    const rows = within(within(tableRegion).getByRole("table")).getAllByRole("row").slice(1);
    // 번호 순서 그대로(정렬 없음)
    expect(rows.map((r) => within(r).getAllByRole("cell")[0]!.textContent)).toEqual(Array.from({ length: 45 }, (_, i) => String(i + 1)));
    // 필수 표기 5종
    const meta = p.querySelector(".ll-stats__meta") as HTMLElement;
    expect(within(meta).getByText("제 1,083~1,132회 (최근 50회)")).toBeInTheDocument();
    expect(within(meta).getByText("50회")).toBeInTheDocument();
    expect(within(meta).getByText("6.7회 (무작위 기대 횟수)")).toBeInTheDocument();
    expect(within(p).getByText("LOTTO LAB 집계")).toBeInTheDocument();
    expect(p.querySelector(".ll-updated time")).toHaveAttribute("dateTime", "2026-11-07T13:00:00.000Z");
    expect(within(p).getByText("과거 데이터 통계이며 미래 예측이 아닙니다.")).toBeInTheDocument();
    expect(screen.getByText("미래 예측 아님")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it("연금 자리별 숫자: 히트맵과 표를 함께, 요약의 최근 회차에서 회차 상세(D-08)로", async () => {
    const m = mockCore();
    m.statistics.mockResolvedValue(
      ok({
        payload: { baseline: { num: 5, den: 1 }, values: Array.from({ length: 6 }, () => Array.from({ length: 10 }, (_, d) => d)) },
        range_from: 241,
        range_to: 290,
        sample_size: 50,
        source: "LOTTO LAB 집계",
        updated_at: "2026-11-07T13:00:00.000Z",
      }),
    );
    render(<Statistics core={m.core} links={links} layout="wide" initialGame="pension" />);
    const p = await screen.findByRole("region", { name: /연금복권 720\+ 자리별 숫자 출현 횟수$/ });
    expect(within(p).getByRole("img", { name: /히트맵/ })).toBeInTheDocument();
    expect(within(p).getByRole("region", { name: /대체 표 영역/ })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "회차 상세" })).toHaveAttribute("href", "#/draws/pension/290");
  });

  it("빈 기간: 기간 확장 안내(전체 기간으로 보기)", async () => {
    const m = mockCore();
    m.statistics.mockResolvedValue(ok(null));
    render(<Statistics core={m.core} links={links} layout="wide" />);
    expect(await screen.findByRole("button", { name: "전체 기간으로 보기" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "회차 상세" })).toHaveAttribute("href", `#/draws/lotto/${LOTTO.draw_no}`);
  });
});
