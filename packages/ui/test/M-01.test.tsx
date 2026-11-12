import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Home } from "../src";
import { FETCHED, LOTTO, LOTTO_STAT, PENSION_STAT, mockCore, ok } from "./screen-core";

const links = { generate: "#/generate", lotto: "#/generate/lotto", pension: "#/generate/pension", stats: "#/stats", tickets: "#/tickets" };

describe("M-01 홈", () => {
  it("로딩: 회차·통계를 받는 동안 스켈레톤과 로딩 알림", () => {
    const m = mockCore();
    m.latestDraw.mockReturnValue(new Promise(() => {}));
    m.statistics.mockReturnValue(new Promise(() => {}));
    render(<Home core={m.core} links={links} />);
    expect(screen.getByText("회차 정보를 불러오는 중입니다")).toBeInTheDocument();
    expect(screen.getByText("로또 통계를 불러오는 중입니다")).toBeInTheDocument();
    expect(screen.getByText("연금 통계를 불러오는 중입니다")).toBeInTheDocument();
  });

  it("성공: 최신 회차 번호·보너스·출처·검증 시각, 통계 요약(기간·표본·미래 예측 아님)", async () => {
    const m = mockCore();
    render(<Home core={m.core} links={links} />);
    const latest = await screen.findByRole("region", { name: "로또 6/45 최신 회차" });
    expect(within(latest).getByText("제 1,132회")).toBeInTheDocument();
    expect(within(latest).getAllByRole("img").map((b) => b.getAttribute("aria-label"))).toEqual([
      "7번",
      "12번",
      "18번",
      "27번",
      "34번",
      "40번",
      "보너스 41번",
    ]);
    expect(within(latest).getByText("www.dhlottery.co.kr 공개 결과")).toBeInTheDocument();
    expect(latest.querySelector(".ll-updated time")).toHaveAttribute("dateTime", LOTTO.source_verified_at);
    await userEvent.click(within(latest).getByRole("button", { name: "공식 결과 보기" }));
    expect(m.open).toHaveBeenCalledWith(LOTTO.source_url);
    expect(screen.getByText("000719")).toBeInTheDocument();

    const summary = screen.getByRole("region", { name: "이번 주 통계 요약" });
    expect(within(summary).getByText(/요약 기간 제 1123~1132회/)).toBeInTheDocument();
    expect(within(summary).getByText("미래 예측 아님")).toBeInTheDocument();
    expect(within(summary).getByText(/로또 제 1123~1132회 · 표본 10회/)).toBeInTheDocument();
    const top = within(summary).getByRole("list", { name: "출현 횟수가 많은 번호" });
    expect(within(top).getAllByRole("img").map((b) => b.getAttribute("aria-label"))).toEqual(["12번", "18번", "27번", "34번", "40번"]);
    expect(m.statistics).toHaveBeenCalledWith("lotto", "last10", "lotto.number_freq", { force: false });
  });

  it("빈: 회차 0행이면 미갱신 안내, 기록이 없으면 생성 CTA", async () => {
    const m = mockCore();
    m.latestDraw.mockResolvedValue(ok(null));
    m.statistics.mockResolvedValue(ok(null));
    render(<Home core={m.core} links={links} />);
    expect(await screen.findByText("로또 회차 정보가 아직 수집되지 않았습니다(미갱신).")).toBeInTheDocument();
    expect(screen.getByText("연금복권 회차 정보가 아직 수집되지 않았습니다(미갱신).")).toBeInTheDocument();
    expect(screen.getByText("로또 통계가 아직 집계되지 않았습니다(미갱신).")).toBeInTheDocument();
    expect(screen.getByText("연금 통계가 아직 집계되지 않았습니다(미갱신).")).toBeInTheDocument();
    expect(await screen.findByText("아직 저장한 번호가 없습니다")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "번호 생성하기" }).map((a) => a.getAttribute("href"))).toContain("#/generate");
  });

  it("오류: 캐시도 없이 실패하면 오류 안내와 다시 시도(force)", async () => {
    const m = mockCore();
    m.latestDraw.mockResolvedValue({ data: null, fetched_at: null, stale: true, error: "NETWORK" });
    render(<Home core={m.core} links={links} />);
    const title = await screen.findByText("회차 정보를 불러오지 못했습니다");
    await userEvent.click(within(title.closest(".ll-state") as HTMLElement).getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(m.latestDraw).toHaveBeenLastCalledWith("pension", { force: true }));
  });

  it("오프라인(stale): 마지막 정상본·출처를 유지하고 배너로 알린다 / EMPTY는 이전 회차 안내", async () => {
    const m = mockCore();
    m.latestDraw.mockImplementation(async (game) =>
      game === "lotto" ? { data: LOTTO, fetched_at: FETCHED, stale: true, error: "NETWORK" } : { data: null, fetched_at: null, stale: false },
    );
    const { unmount } = render(<Home core={m.core} links={links} />);
    expect(await screen.findByText("서버에 연결하지 못해 마지막으로 받은 정보를 보여 줍니다.")).toBeInTheDocument();
    expect(document.querySelector(".ll-banner__meta time")).toHaveAttribute("dateTime", FETCHED);
    expect(screen.getByText("www.dhlottery.co.kr 공개 결과")).toBeInTheDocument();
    unmount();

    m.latestDraw.mockResolvedValue({ data: LOTTO, fetched_at: FETCHED, stale: true, error: "EMPTY" });
    render(<Home core={m.core} links={links} />);
    expect(await screen.findByText("최신 회차가 아직 갱신되지 않아 이전 회차를 보여 줍니다.")).toBeInTheDocument();
  });

  it("내 기록: 저장·구매등록·확인대기(회차 미입력·추첨 전) 수", async () => {
    const m = mockCore();
    m.list.mockResolvedValue([
      { game: "lotto", purchase_status: "favorite", round: null },
      { game: "lotto", purchase_status: "purchased", round: 1132 },
      { game: "lotto", purchase_status: "purchased", round: 1133 },
      { game: "pension", purchase_status: "purchased", round: null },
    ]);
    m.history.mockResolvedValue([{ game: "pension", created_at: FETCHED, numbers: { digits: "000719" } }]);
    render(<Home core={m.core} links={links} />);
    await screen.findByText("제 1,132회");
    const records = await screen.findByRole("region", { name: "내 기록" });
    await within(records).findByText("저장한 번호");
    const values = Array.from(records.querySelectorAll(".ll-stat")).map((dl) => [
      dl.querySelector("dt")?.textContent,
      dl.querySelector(".ll-stat__value")?.textContent,
    ]);
    expect(values).toEqual([
      ["저장한 번호", "4"],
      ["구매 등록", "3"],
      ["추첨 대기", "2"],
    ]);
    expect(within(records).getByRole("link", { name: /같은 복권으로 다시 만들기/ })).toHaveAttribute("href", "#/generate/pension");
  });

  it("1게임 빠른 생성: 기기에서 만든 번호와 고지(추천은 저장·구매 기록 아님)", async () => {
    const m = mockCore();
    render(<Home core={m.core} links={links} />);
    await userEvent.click(screen.getByRole("button", { name: "로또 1게임 빠른 생성" }));
    const result = await screen.findByRole("list", { name: "생성한 번호" });
    expect(within(result).getAllByRole("img")).toHaveLength(6);
    expect(screen.getByText(/저장 번호·구매 기록이 아닙니다/)).toBeInTheDocument();
    expect(m.generate).toHaveBeenCalledWith({ game: "lotto", config: { fixed: [], excluded: [], games: 1 } });
  });

  it("통계 요약은 복권별 상태: 한쪽 실패는 그 블록에 오류·재시도, 다른 쪽은 표시", async () => {
    const m = mockCore();
    m.statistics.mockImplementation(async (game) =>
      game === "lotto" ? ok(LOTTO_STAT) : { data: null, fetched_at: null, stale: true, error: "NETWORK" },
    );
    render(<Home core={m.core} links={links} />);
    const summary = await screen.findByRole("region", { name: "이번 주 통계 요약" });
    expect(await within(summary).findByRole("list", { name: "출현 횟수가 많은 번호" })).toBeInTheDocument();
    expect(within(summary).getByRole("alert")).toHaveTextContent("연금 통계를 불러오지 못했습니다.");
    await userEvent.click(within(summary).getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(m.statistics).toHaveBeenLastCalledWith("pension", "last10", "pension.group_freq", { force: true }));
  });

  it("기준선 형식이 유효하지 않으면 그 요약을 숨기고 안내(기준선 없는 수치 노출 금지)", async () => {
    const m = mockCore();
    m.statistics.mockImplementation(async (game) =>
      game === "lotto"
        ? ok({ ...LOTTO_STAT, payload: { ...LOTTO_STAT.payload, baseline: { num: 4, den: 0 } } })
        : ok({ ...PENSION_STAT, payload: { ...PENSION_STAT.payload, baseline: [{ num: 2, den: 1 }] } }),
    );
    render(<Home core={m.core} links={links} />);
    const summary = await screen.findByRole("region", { name: "이번 주 통계 요약" });
    expect(await within(summary).findAllByText("기준선을 확인할 수 없어 표시하지 않아요.")).toHaveLength(2);
    expect(within(summary).queryByRole("list", { name: "출현 횟수가 많은 번호" })).not.toBeInTheDocument();
    expect(within(summary).queryByRole("list", { name: "출현 횟수가 많은 조" })).not.toBeInTheDocument();
  });

  it("알림·설정은 P1 비활성", () => {
    const m = mockCore();
    render(<Home core={m.core} links={links} />);
    expect(screen.getByRole("button", { name: "알림 (준비 중)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "설정 (준비 중)" })).toBeDisabled();
  });
});
