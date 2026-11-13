import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Statistics } from "../src";
import { yTicks } from "../src/screens/M-04/mobile";
import { FETCHED, LOTTO, PENSION, mockCore, ok } from "./screen-core";

const links = { home: "#/", draws: (game: "lotto" | "pension") => `#/draws?game=${game}` };

// 번호 순서와 다르게 들쭉날쭉한 값 — 화면이 정렬하지 않는지 확인한다.
const FREQ = Array.from({ length: 45 }, (_, i) => (i * 7) % 11);
const row = (over: Record<string, unknown> = {}) => ({
  game: "lotto",
  window_key: "last50",
  metric: "lotto.number_freq",
  payload: { baseline: { num: 20, den: 3 }, values: FREQ },
  range_from: 1083,
  range_to: 1132,
  sample_size: 50,
  source: "LOTTO LAB 집계",
  updated_at: "2026-11-07T13:00:00.000Z",
  ...over,
});

const FORBIDDEN = /hot|cold|핫|콜드|순위|확률 상승|당첨 확률이 높은|당첨 보장|많이 나온|적게 나온|트렌드|추천/i;

async function panel() {
  return screen.findByRole("region", { name: /로또 6\/45 번호별 출현 횟수$/ });
}

describe("M-04 통계", () => {
  it("로딩: 불러오는 중 알림", () => {
    const m = mockCore();
    m.statistics.mockReturnValue(new Promise(() => {}));
    render(<Statistics core={m.core} links={links} />);
    expect(screen.getByText("통계를 불러오는 중입니다")).toBeInTheDocument();
    expect(screen.getByText("미래 예측 아님")).toBeInTheDocument();
  });

  it("성공: 필수 표기(기간·표본·기준선·출처·갱신 시각·미래 예측 아님), 막대는 번호 순서·기준선 가로선", async () => {
    const m = mockCore();
    m.statistics.mockResolvedValue(ok(row()));
    const { container } = render(<Statistics core={m.core} links={links} />);
    const p = await panel();
    expect(m.statistics).toHaveBeenCalledWith("lotto", "last50", "lotto.number_freq", { force: false });
    const meta = p.querySelector(".ll-stats__meta") as HTMLElement;
    expect(within(meta).getByText("제 1,083~1,132회 (최근 50회)")).toBeInTheDocument();
    expect(within(meta).getByText("50회")).toBeInTheDocument();
    expect(within(meta).getByText("6.7회 (무작위 기대 횟수)")).toBeInTheDocument();
    expect(within(p).getByText("LOTTO LAB 집계")).toBeInTheDocument();
    expect(p.querySelector(".ll-updated time")).toHaveAttribute("dateTime", "2026-11-07T13:00:00.000Z");
    expect(within(p).getByText("과거 데이터 통계이며 미래 예측이 아닙니다.")).toBeInTheDocument();
    expect(within(p).queryByText("표본 적음")).toBeNull();
    // InfoTip으로 용어 설명
    for (const term of ["기간", "표본", "기준선"]) expect(within(p).getByRole("button", { name: `${term} 설명` })).toBeInTheDocument();

    const svg = within(p).getByRole("img", { name: /막대 차트/ });
    const labels = Array.from(svg.querySelectorAll(".ll-chart__label")).map((t) => t.textContent);
    expect(labels).toEqual(Array.from({ length: 45 }, (_, i) => String(i + 1)));
    const values = Array.from(svg.querySelectorAll(".ll-chart__value")).map((t) => Number(t.textContent));
    expect(values).toEqual(FREQ);
    expect(svg.querySelectorAll(".ll-chart__baseline")).toHaveLength(1);
    expect(svg.querySelector("title")).toHaveTextContent("로또 6/45 번호별 출현 횟수 · 제 1,083~1,132회 (최근 50회)");
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it("표 대체: 표로 보기 토글 → 번호 순서 표(값·기준선), 다시 누르면 차트", async () => {
    const m = mockCore();
    m.statistics.mockResolvedValue(ok(row()));
    render(<Statistics core={m.core} links={links} />);
    const p = await panel();
    const toggle = within(p).getByRole("button", { name: "표로 보기" });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(within(p).queryByRole("img", { name: /막대 차트/ })).toBeNull();
    const table = within(p).getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(45);
    expect(within(rows[0]!).getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "0회", "6.7"]);
    expect(within(rows[1]!).getAllByRole("cell").map((c) => c.textContent)).toEqual(["2", "7회", "6.7"]);
    await userEvent.click(toggle);
    expect(within(p).getByRole("img", { name: /막대 차트/ })).toBeInTheDocument();
  });

  it("표본 < 50이면 표본 적음", async () => {
    const m = mockCore();
    m.statistics.mockResolvedValue(ok(row({ sample_size: 20, range_from: 1113, payload: { baseline: { num: 8, den: 3 }, values: FREQ } })));
    render(<Statistics core={m.core} links={links} />);
    const p = await panel();
    expect(within(p).getByText("표본 적음")).toBeInTheDocument();
  });

  it("빈: 0행이면 미갱신 안내 + 기간 변경 CTA(전체), 미래 예측 아님 고지는 유지", async () => {
    const m = mockCore();
    m.statistics.mockResolvedValue(ok(null));
    render(<Statistics core={m.core} links={links} />);
    expect(await screen.findByText("최근 50회 통계가 아직 없습니다")).toBeInTheDocument();
    expect(screen.getByText("미래 예측 아님")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "전체 기간으로 보기" }));
    await waitFor(() => expect(m.statistics).toHaveBeenLastCalledWith("lotto", "all", "lotto.number_freq", { force: false }));
    expect(screen.getByRole("radio", { name: "전체" })).toBeChecked();
  });

  it("오류: 캐시 없이 실패하면 오류·다시 시도(force) / stale이면 마지막 정상본 유지 + 배너", async () => {
    const m = mockCore();
    m.statistics.mockResolvedValueOnce({ data: null, fetched_at: null, stale: true, error: "NETWORK" });
    m.statistics.mockResolvedValueOnce({ data: row(), fetched_at: FETCHED, stale: true, error: "NETWORK" });
    render(<Statistics core={m.core} links={links} />);
    expect(await screen.findByText("통계를 불러오지 못했습니다")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("서버에 연결하지 못해 마지막으로 받은 정보를 보여 줍니다.")).toBeInTheDocument();
    expect(m.statistics).toHaveBeenLastCalledWith("lotto", "last50", "lotto.number_freq", { force: true });
    expect(screen.getByRole("img", { name: /막대 차트/ })).toBeInTheDocument();
  });

  it("미출현: 기간 안 미출현(censored)은 'N회 이상', 기준선은 기대 간격", async () => {
    const m = mockCore();
    const values = Array.from({ length: 45 }, (_, i) => (i === 0 ? { gap: null, censored: true } : { gap: i % 9, censored: false }));
    m.statistics.mockResolvedValue(ok(row({ metric: "lotto.gap", payload: { baseline: { num: 15, den: 2 }, values } })));
    render(<Statistics core={m.core} links={links} />);
    await userEvent.click(await screen.findByRole("radio", { name: "미출현" }));
    const p = await screen.findByRole("region", { name: /번호별 마지막 출현 후 지난 회차$/ });
    expect(await within(p).findByText("기대 간격 7.5회")).toBeInTheDocument();
    const svg = within(p).getByRole("img", { name: /막대 차트/ });
    expect(svg.querySelector(".ll-chart__bar--censored + text")).toHaveTextContent("50회 이상");
    await userEvent.click(within(p).getByRole("button", { name: "표로 보기" }));
    const first = within(within(p).getByRole("table")).getAllByRole("row")[1]!;
    expect(within(first).getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "50회 이상", "7.5"]);
  });

  it("지표: 로또 6종·연금 3종, 연금은 자리별 히트맵(칸 숫자 병기)", async () => {
    const m = mockCore();
    const digits = Array.from({ length: 6 }, (_, p) => Array.from({ length: 10 }, (_, d) => (p + d) % 7));
    m.statistics.mockImplementation(async (game, _w, metric) =>
      ok(game === "lotto" ? row() : row({ game, metric, payload: { baseline: { num: 5, den: 1 }, values: digits } })),
    );
    render(<Statistics core={m.core} links={links} />);
    const metrics = screen.getByRole("radiogroup", { name: "지표" });
    expect(within(metrics).getAllByRole("radio")).toHaveLength(6);
    expect(within(screen.getByRole("radiogroup", { name: "기간(최근 회차 수)" })).getAllByRole("radio")).toHaveLength(5);
    await userEvent.click(screen.getByRole("radio", { name: "연금복권 720+" }));
    expect(within(screen.getByRole("radiogroup", { name: "지표" })).getAllByRole("radio")).toHaveLength(3);
    await waitFor(() => expect(m.statistics).toHaveBeenLastCalledWith("pension", "last50", "pension.digit_freq", { force: false }));
    const heat = await screen.findByRole("img", { name: /히트맵/ });
    const cells = heat.querySelectorAll(".ll-heat__cell");
    expect(cells).toHaveLength(60);
    expect(Array.from(cells).slice(0, 10).map((c) => c.textContent)).toEqual(["0", "1", "2", "3", "4", "5", "6", "0", "1", "2"]);
    expect(screen.getByText("칸마다 5.0회 (무작위 기대 횟수)")).toBeInTheDocument();
  });

  it("형식이 맞지 않는 payload(기준선 없음)는 수치를 보이지 않는다", async () => {
    const m = mockCore();
    m.statistics.mockResolvedValue(ok(row({ payload: { baseline: null, values: FREQ } })));
    render(<Statistics core={m.core} links={links} />);
    expect(await screen.findByText("통계 형식을 확인할 수 없어 표시하지 않습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /막대 차트/ })).toBeNull();
  });

  it("~767 출현 빈도: 앱바·1~45 번호 순서 막대(n회, 기준선)·끝자리 0~9 집계·한 줄 캡션, 정렬·순위 없음", async () => {
    const m = mockCore();
    m.statistics.mockResolvedValue(ok(row()));
    const { container } = render(<Statistics core={m.core} links={links} />);
    expect(screen.getByRole("heading", { level: 1, name: "통계 분석" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "홈으로" })).toHaveAttribute("href", "#/");
    const tabs = () => within(screen.getByRole("radiogroup", { name: "분석 보기" })).getAllByRole("radio").map((r) => r.closest("label")!.textContent);
    expect(tabs()).toEqual(["출현 빈도", "기간별 추이", "구간별 출현", "패턴 분석"]);
    const bars = await screen.findByRole("img", { name: /번호별 출현 횟수 막대 그래프\(1~45번 순서\)/ });
    const card = bars.closest("section")!;
    // 번호 순서 그대로(정렬 없음): 라벨 1~45, 값 = payload 순서
    expect(Array.from(bars.querySelectorAll(".ll-chart__label")).map((t) => t.textContent)).toEqual(Array.from({ length: 45 }, (_, i) => String(i + 1)));
    expect(Array.from(bars.querySelectorAll(".ll-chart__value")).map((t) => t.textContent)).toEqual(FREQ.map((v) => `${v}회`));
    expect(bars.querySelectorAll(".ll-chart__baseline")).toHaveLength(1);
    // y축 정수 눈금(최대 10 → 0·5·10), 보조 장식이라 접근성 트리에서 숨김
    const axis = card.querySelector(".ll-stats__yaxis")!;
    expect(axis).toHaveAttribute("aria-hidden", "true");
    expect(Array.from(axis.querySelectorAll("text")).map((t) => t.textContent)).toEqual(["0", "5", "10"]);
    expect(within(card).getByText("제 1,083~1,132회 · 표본 50회 · 기준선 6.7회 · 미래 예측 아님")).toBeInTheDocument();

    // 끝자리: 0~9 순서, 번호별 횟수를 끝자리로 묶은 합, 기준선 = 번호당 기준선 × 끝자리 번호 개수(캡션)
    const digits = screen.getByRole("table", { name: /끝자리 0~9별 출현 횟수/ });
    expect(within(digits).getAllByRole("columnheader").slice(1).map((c) => c.textContent)).toEqual(Array.from({ length: 10 }, (_, d) => String(d)));
    const [countRow] = within(digits).getAllByRole("row").slice(1);
    const expected = Array.from({ length: 10 }, (_, d) => FREQ.reduce((a, v, i) => ((i + 1) % 10 === d ? a + v : a), 0));
    expect(within(countRow!).getAllByRole("cell").map((c) => Number(c.textContent))).toEqual(expected);
    expect(within(digits.closest("section")!).getByText(/기준선 끝자리 0·6~9 26\.7회, 1~5 33\.3회 · 미래 예측 아님$/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(FORBIDDEN);

    await userEvent.click(screen.getByRole("radio", { name: "연금복권 720+" }));
    expect(tabs()).toEqual(["출현 빈도", "기간별 추이", "조별 출현", "패턴 분석"]);
  });

  it("~767 번호 막대의 값은 보조기기용 표로도 읽힌다(번호 순서, 기준선 포함)", async () => {
    const m = mockCore();
    m.statistics.mockResolvedValue(ok(row()));
    render(<Statistics core={m.core} links={links} />);
    const table = await screen.findByRole("table", { name: /번호별 출현 횟수 표\(1~45번 순서, 최근 50회차, 기준선 6\.7회\)/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual(Array.from({ length: 45 }, (_, i) => String(i + 1)));
    expect(rows.map((r) => within(r).getByRole("cell").textContent)).toEqual(FREQ.map((v) => `${v}회`));
  });

  it("~767 최근 추첨 결과: 요청 실패면 오류 문구만(로딩 문구 없음)", async () => {
    const m = mockCore();
    m.statistics.mockResolvedValue(ok(row()));
    m.listDraws.mockRejectedValue(new Error("boom"));
    render(<Statistics core={m.core} links={links} />);
    expect(await screen.findByText("최근 추첨 결과를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByText("최근 추첨 결과를 불러오는 중입니다")).toBeNull();
  });

  it("~767 최근 10회 추첨 결과 표: listDraws(limit 10), 회차·추첨일·번호, 전체 보기 링크", async () => {
    const m = mockCore();
    m.statistics.mockResolvedValue(ok(row()));
    render(<Statistics core={m.core} links={links} />);
    const table = await screen.findByRole("table", { name: /최근 1회 추첨 결과/ });
    expect(m.listDraws).toHaveBeenCalledWith("lotto", { limit: 10, force: false });
    const cells = within(table).getAllByRole("row")[1]!;
    expect(within(cells).getByText("1,132회")).toBeInTheDocument();
    expect(within(cells).getByText("2026.11.07")).toBeInTheDocument();
    expect(within(cells).getByRole("img", { name: "보너스 41번" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "회차 결과 전체 보기" })).toHaveAttribute("href", "#/draws?game=lotto");
  });

  it("~767 보기 탭: 구간별 = 로또 구간(1~10…41~45 순서)·연금 조(1~5조 순서), 패턴 분석은 지표 유지, 출현 빈도는 기본 지표", async () => {
    const m = mockCore();
    m.statistics.mockImplementation(async (game, _w, metric) =>
      ok(
        game === "lotto"
          ? metric === "lotto.range_dist"
            ? row({ metric, payload: { baseline: [{ num: 200, den: 3 }, { num: 200, den: 3 }, { num: 200, den: 3 }, { num: 200, den: 3 }, { num: 100, den: 3 }], values: [70, 60, 72, 64, 34] } })
            : row()
          : row({ game, metric, payload: { baseline: { num: 10, den: 1 }, values: [9, 12, 8, 11, 10] } }),
      ),
    );
    render(<Statistics core={m.core} links={links} />);
    await userEvent.click(screen.getByRole("radio", { name: "구간별 출현" }));
    await waitFor(() => expect(m.statistics).toHaveBeenLastCalledWith("lotto", "last50", "lotto.range_dist", { force: false }));
    const range = await screen.findByRole("img", { name: /번호 구간별 출현 횟수 막대 차트/ });
    expect(Array.from(range.querySelectorAll(".ll-chart__label")).map((t) => t.textContent)).toEqual(["1~10", "11~20", "21~30", "31~40", "41~45"]);
    expect(Array.from(range.querySelectorAll(".ll-chart__value")).map((t) => t.textContent)).toEqual(["70", "60", "72", "64", "34"]);

    await userEvent.click(screen.getByRole("radio", { name: "연금복권 720+" }));
    await waitFor(() => expect(m.statistics).toHaveBeenLastCalledWith("pension", "last50", "pension.group_freq", { force: false }));
    const groups = await screen.findByRole("img", { name: /조별 출현 횟수 막대 차트/ });
    expect(Array.from(groups.querySelectorAll(".ll-chart__label")).map((t) => t.textContent)).toEqual(["1조", "2조", "3조", "4조", "5조"]);
    await userEvent.click(screen.getByRole("radio", { name: "패턴 분석" }));
    expect(m.statistics).toHaveBeenLastCalledWith("pension", "last50", "pension.group_freq", { force: false });
    await userEvent.click(screen.getByRole("radio", { name: "출현 빈도" }));
    await waitFor(() => expect(m.statistics).toHaveBeenLastCalledWith("pension", "last50", "pension.digit_freq", { force: false }));
  });

  it("상단 요약: 최근 회차(번호·출처·검증 시각)·집계 요약(기간·표본·집계 합계), 회차 목록 링크는 현재 복권", async () => {
    const m = mockCore();
    m.statistics.mockImplementation(async (game) =>
      ok(game === "lotto" ? row() : row({ game, metric: "pension.digit_freq", payload: { baseline: { num: 5, den: 1 }, values: Array.from({ length: 6 }, () => new Array(10).fill(5)) } })),
    );
    render(<Statistics core={m.core} links={links} />);
    const summary = await screen.findByRole("region", { name: "로또 6/45 요약" });
    const latest = within(summary).getByRole("region", { name: "최근 회차" });
    expect(await within(latest).findByText("제 1,132회")).toBeInTheDocument();
    expect(within(latest).getAllByRole("img").map((b) => b.getAttribute("aria-label"))).toContain("보너스 41번");
    expect(within(latest).getByText("www.dhlottery.co.kr 공개 결과")).toBeInTheDocument();
    expect(latest.querySelector(".ll-updated time")).toHaveAttribute("dateTime", LOTTO.source_verified_at);
    expect(await within(summary).findByText("제 1,083~1,132회 (최근 50회)")).toBeInTheDocument();
    expect(within(summary).getByText(`${FREQ.reduce((a, b) => a + b, 0)}회`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "지난 회차 결과 보기" })).toHaveAttribute("href", "#/draws?game=lotto");

    await userEvent.click(screen.getByRole("radio", { name: "연금복권 720+" }));
    expect(await screen.findByRole("region", { name: "연금복권 720+ 요약" })).toBeInTheDocument();
    expect(await screen.findAllByText(PENSION.digits)).not.toHaveLength(0);
    expect(await screen.findByText("300회")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "지난 회차 결과 보기" })).toHaveAttribute("href", "#/draws?game=pension");
  });
});

describe("yTicks — y축 정수 눈금", () => {
  it("0부터 1·2·5×10ⁿ 간격, 4칸 이하로 최대값을 덮는다", () => {
    expect(yTicks(0)).toEqual([0, 1]);
    expect(yTicks(3)).toEqual([0, 1, 2, 3]);
    expect(yTicks(6.7)).toEqual([0, 2, 4, 6, 8]);
    expect(yTicks(13)).toEqual([0, 5, 10, 15]);
    expect(yTicks(38)).toEqual([0, 10, 20, 30, 40]);
  });
});
