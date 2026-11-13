// M-02 ~767 배치(task-047, 시안 m-lotto.png): 앱바·보기 탭·9열 번호판(고른 번호 = 포함)·추가 옵션(고정·제외·홀짝)·결과 아래 한 줄 고지.
// jsdom은 matchMedia가 없어 768~ 배치로 그린다 — 여기서는 ~767 질의만 맞는 matchMedia를 넣는다.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LottoGenerator } from "../src";
import { GEN_LINKS, engineError, mockGeneratorCore, renderWithNotice } from "./generator-core";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("max-width: 47.99em"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});
afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

function setup(layout?: "split") {
  const m = mockGeneratorCore();
  const user = userEvent.setup();
  renderWithNotice(<LottoGenerator core={m.core} links={GEN_LINKS} layout={layout} />);
  return { m, user };
}
const grid = () => screen.getByRole("group", { name: /번호 고르기/ });

describe("M-02 ~767 로또 생성", () => {
  it("앱바·보기 탭·번호판 바로 노출: 고른 번호 = 포함 번호, 선택 n/6 배지", async () => {
    const { m, user } = setup();
    expect(screen.getByRole("link", { name: "뒤로 가기" })).toHaveAttribute("href", GEN_LINKS.generate);
    expect(screen.getByRole("button", { name: "로또 번호 생성 안내" })).toBeInTheDocument();
    const tabs = screen.getByRole("group", { name: "보기" });
    expect(within(tabs).getAllByRole("button").map((b) => b.textContent)).toStrictEqual(["번호 선택", "추천 결과", "분석 정보"]);
    expect(screen.queryByRole("radio", { name: "무작위" })).not.toBeInTheDocument();
    expect(screen.getByText("선택 0 / 6")).toBeInTheDocument();
    await user.click(within(grid()).getByRole("button", { name: "12번" }));
    await user.click(within(grid()).getByRole("button", { name: "34번" }));
    expect(screen.getByText("선택 2 / 6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "고정번호 (2)" })).toHaveAttribute("aria-pressed", "true");
    expect(["1게임", "5게임", "10게임", "20게임"].every((n) => screen.getByRole("radio", { name: n }))).toBe(true);
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    expect(m.generate).toHaveBeenCalledWith({ game: "lotto", config: { fixed: [12, 34], excluded: [], games: 5 } });
    expect(await screen.findByRole("heading", { name: "추천 번호 (5게임)" })).toBeInTheDocument();
    expect(screen.getByText("미래 예측 아님", { selector: ".ll-gen__caption strong" })).toBeInTheDocument();
  });

  it("제외번호 옵션: 번호판이 제외 고르기로 바뀌고 고정번호는 잠긴다", async () => {
    const { m, user } = setup();
    await user.click(within(grid()).getByRole("button", { name: "3번" }));
    await user.click(screen.getByRole("button", { name: "제외번호 (0)" }));
    expect(screen.getByText("제외 0 / 39")).toBeInTheDocument();
    expect(within(grid()).getByRole("button", { name: "3번, 고정수" })).toBeDisabled();
    await user.click(within(grid()).getByRole("button", { name: "7번" }));
    expect(screen.getByRole("button", { name: "제외번호 (1)" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    expect(m.generate).toHaveBeenCalledWith({ game: "lotto", config: { fixed: [3], excluded: [7], games: 5 } });
  });

  it("홀짝 옵션: 비율을 고르면 odd가 엔진에 전달되고, 무관이면 빠진다", async () => {
    const { m, user } = setup();
    const parity = screen.getByRole("button", { name: "홀짝" });
    expect(parity).toHaveAttribute("aria-expanded", "false");
    await user.click(parity);
    expect(parity).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("radio", { name: "무관" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "홀 4 : 짝 2" }));
    expect(screen.getByRole("button", { name: "홀짝 4:2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    expect(m.generate).toHaveBeenLastCalledWith({ game: "lotto", config: { fixed: [], excluded: [], games: 5, odd: 4 } });
    await screen.findByRole("heading", { name: "추천 번호 (5게임)" });
    await user.click(screen.getByRole("radio", { name: "무관" }));
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    expect(m.generate.mock.calls.at(-1)![0].config).not.toHaveProperty("odd");
  });

  it("홀짝 불가능(lotto.parity): 대기 없이 원인 안내 → 홀짝 조건 해제", async () => {
    const { m, user } = setup();
    m.generate.mockRejectedValueOnce(engineError("lotto.parity", { odd: 0, fixed_odd: 1, fixed_even: 0, pool_odd: 22, pool_even: 22 }));
    await user.click(within(grid()).getByRole("button", { name: "1번" }));
    await user.click(screen.getByRole("button", { name: "홀짝" }));
    await user.click(screen.getByRole("radio", { name: "홀 0 : 짝 6" }));
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    const alert = (await screen.findByText("홀짝 비율을 맞출 수 없어요")).closest<HTMLElement>(".ll-gen__problem")!;
    expect(alert).toHaveTextContent("홀수 1개");
    await user.click(within(alert).getByRole("button", { name: "홀짝 조건 해제" }));
    expect(screen.queryByText("홀짝 비율을 맞출 수 없어요")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "홀짝" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    expect(m.generate).toHaveBeenLastCalledWith({ game: "lotto", config: { fixed: [1], excluded: [], games: 5 } });
  });

  it("보기 탭: 추천 결과 = 결과만, 분석 정보 = 조건 요약·통계 링크(결과 저장 상태는 유지)", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    await screen.findByRole("heading", { name: "추천 번호 (5게임)" });
    await user.click(screen.getByRole("checkbox", { name: "1게임 선택" }));
    await user.click(screen.getByRole("button", { name: "추천 결과" }));
    expect(screen.queryByRole("group", { name: /번호 고르기/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "추천 번호 (5게임)" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "분석 정보" }));
    expect(screen.getByRole("heading", { name: "분석 정보" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "지난 회차 통계 보기" })).toHaveAttribute("href", GEN_LINKS.stats);
    expect(screen.getByText(/미래 예측이 아닙니다/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "추천 결과" }));
    expect(screen.getByRole("checkbox", { name: "1게임 선택" })).toBeChecked();
  });

  it("Windows split 배치는 창 너비와 무관하게 기존 구조(탭·앱바 없음, 생성 방식 선택)", () => {
    setup("split");
    expect(screen.queryByRole("group", { name: "보기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "뒤로 가기" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "무작위" })).toBeChecked();
  });
});
