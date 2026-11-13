import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LottoGenerator } from "../src";
import { GEN_LINKS, engineError, fakeGenerate, mockGeneratorCore, renderWithNotice } from "./generator-core";

function setup(restoreLast = false) {
  const m = mockGeneratorCore();
  const user = userEvent.setup();
  renderWithNotice(<LottoGenerator core={m.core} links={GEN_LINKS} restoreLast={restoreLast} />);
  return { m, user };
}
const rows = () => Array.from(screen.getByRole("list", { name: "추천 번호 목록" }).querySelectorAll<HTMLElement>(".ll-result__row"));

describe("M-02 로또 생성", () => {
  it("빈 상태 → 무작위 5게임 생성: 추천 번호·고지·지난 설정 저장", async () => {
    const { m, user } = setup();
    expect(screen.getByText("아직 생성한 번호가 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "무작위" })).toBeChecked();
    expect(screen.queryByText(/통계 조건 반영/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    expect(m.generate).toHaveBeenCalledWith({ game: "lotto", config: { fixed: [], excluded: [], games: 5 } });
    expect(await screen.findByRole("heading", { name: "추천 번호 (5게임)" })).toBeInTheDocument();
    expect(rows()).toHaveLength(5);
    expect(rows().every((r) => within(r).getByText("추천 번호"))).toBe(true);
    expect(screen.getByText(/미래 예측 아님/)).toBeInTheDocument();
    expect(screen.getByText(/당첨과 무관합니다/)).toBeInTheDocument();
    expect(m.saveLast).toHaveBeenCalledWith({ game: "lotto", config: { fixed: [], excluded: [], games: 5 } });
    expect(m.saveFromGenerated).not.toHaveBeenCalled();
  });

  it("조건 지정: 고정/제외 분리 선택·재탭 해제·다른 목록 번호는 잠금, 게임 수 직접 입력", async () => {
    const { m, user } = setup();
    await user.click(screen.getByRole("radio", { name: "조건 지정" }));
    const grid = () => screen.getByRole("group", { name: /고르기/ });
    await user.click(within(grid()).getByRole("button", { name: "7번" }));
    await user.click(within(grid()).getByRole("button", { name: "12번" }));
    await user.click(within(grid()).getByRole("button", { name: "12번, 고정수" })); // 재탭 해제
    expect(within(grid()).getByRole("button", { name: "12번" })).toHaveAttribute("aria-pressed", "false");
    expect(within(grid()).getByRole("button", { name: "7번, 고정수" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("radiogroup", { name: "번호를 누르면" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "제외수로 고르기" }));
    expect(screen.getByRole("radio", { name: "제외수로 고르기" })).toBeChecked();
    expect(within(grid()).getByRole("button", { name: "7번, 고정수" })).toBeDisabled();
    expect(within(grid()).getByRole("button", { name: "7번, 고정수" })).toHaveAttribute("aria-pressed", "false");
    await user.click(within(grid()).getByRole("button", { name: "1번" }));
    expect(within(grid()).getByRole("button", { name: "1번, 제외수" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(grid()).getByRole("button", { name: "2번" }));
    await user.click(within(grid()).getByRole("button", { name: "2번, 제외수" }));
    await user.click(screen.getByRole("radio", { name: "직접" }));
    const input = screen.getByRole("textbox", { name: /직접 입력/ });
    expect(input).toHaveAttribute("inputmode", "numeric");
    await user.type(input, "0");
    expect(screen.getByText("1~50 사이 숫자로 입력하세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "추천 번호 생성" })).toBeDisabled();
    await user.clear(input);
    await user.type(input, "12");
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    expect(m.generate).toHaveBeenCalledWith({ game: "lotto", config: { fixed: [7], excluded: [1], games: 12 } });
    const first = (await screen.findByRole("list", { name: "1게임 번호" })) as HTMLElement;
    expect(within(first).getAllByRole("img").length).toBe(6);
  });

  it("불가능 조건: 대기 없이 원인·최대 게임 수 안내 → 게임 수 줄이기로 해결", async () => {
    const { m, user } = setup();
    m.generate.mockRejectedValueOnce(engineError("lotto.too_few_combinations", { max: 39, requested: 50 }));
    await user.click(screen.getByRole("radio", { name: "조건 지정" }));
    for (const n of [1, 2, 3, 4, 5]) await user.click(screen.getByRole("button", { name: `${n}번` }));
    await user.click(screen.getByRole("radio", { name: "직접" }));
    await user.type(screen.getByRole("textbox", { name: /직접 입력/ }), "50");
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    const alert = (await screen.findByText("조건에 맞는 조합이 부족해요")).closest<HTMLElement>(".ll-gen__problem")!;
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveTextContent("조건에 맞는 조합이 부족해요");
    expect(alert).toHaveTextContent("최대 39게임");
    expect(alert).toHaveTextContent("요청 50게임");
    expect(m.saveLast).not.toHaveBeenCalled();
    await user.click(within(alert).getByRole("button", { name: "게임 수를 39게임으로 줄이기" }));
    expect(screen.queryByText("조건에 맞는 조합이 부족해요")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /직접 입력/ })).toHaveValue("39");
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    expect(m.generate).toHaveBeenLastCalledWith({ game: "lotto", config: { fixed: [1, 2, 3, 4, 5], excluded: [], games: 39 } });
    expect(await screen.findByRole("heading", { name: "추천 번호 (39게임)" })).toBeInTheDocument();
  });

  it("선택 저장 → 상태 '즐겨찾기 저장됨'(구매 아님) → 스낵바 실행 취소 = 저장 번호 삭제, 다시 저장은 같은 멱등 키", async () => {
    const { m, user } = setup();
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    await screen.findByRole("heading", { name: "추천 번호 (5게임)" });
    await user.click(screen.getByRole("checkbox", { name: "1게임 선택" }));
    await user.click(screen.getByRole("checkbox", { name: "3게임 선택" }));
    await user.click(screen.getByRole("button", { name: "선택 2개 저장" }));
    expect(m.saveFromGenerated).toHaveBeenCalledTimes(2);
    expect(m.saveFromGenerated).toHaveBeenNthCalledWith(1, "batch-1-1", { purchase_status: "favorite", round: null, idempotency_key: "key-1" });
    expect(m.saveFromGenerated).toHaveBeenNthCalledWith(2, "batch-1-3", { purchase_status: "favorite", round: null, idempotency_key: "key-3" });
    expect(within(rows()[0]!).getByText("즐겨찾기 저장됨")).toBeInTheDocument();
    expect(within(rows()[1]!).getByText("추천 번호")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "추천 번호 목록" })).not.toHaveTextContent(/구매/);
    expect(await screen.findByText("2개를 저장했어요")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "실행 취소" }));
    await waitFor(() => expect(m.remove).toHaveBeenCalledTimes(2));
    expect(m.remove).toHaveBeenCalledWith("key-1");
    await waitFor(() => expect(within(rows()[0]!).getByText("추천 번호")).toBeInTheDocument());
    // ⋯ 메뉴로 다시 저장 → 같은 줄은 같은 멱등 키
    await user.click(screen.getByRole("button", { name: "1게임 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "즐겨찾기로 저장" }));
    expect(m.saveFromGenerated).toHaveBeenLastCalledWith("batch-1-1", { purchase_status: "favorite", round: null, idempotency_key: "key-1" });
    expect(await screen.findByText("저장했어요")).toBeInTheDocument();
  });

  it("저장 실패: 결과를 그대로 두고 원인·다시 시도 안내", async () => {
    const { m, user } = setup();
    m.saveFromGenerated.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "STORAGE_FAILED" }));
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    await screen.findByRole("heading", { name: "추천 번호 (5게임)" });
    await user.click(screen.getByRole("button", { name: "1게임 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "즐겨찾기로 저장" }));
    const card = screen.getByRole("region", { name: "추천 번호 (5게임)" });
    expect(await within(card).findByText(/저장하지 못했어요/)).toBeInTheDocument();
    expect(rows()).toHaveLength(5);
    expect(within(rows()[0]!).getByText("추천 번호")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(within(rows()[0]!).getByText("즐겨찾기 저장됨")).toBeInTheDocument());
  });

  it("복사: 줄 메뉴 → 토스트 '복사했어요', 전체 복사는 모든 줄", async () => {
    const { m, user } = setup();
    await user.click(screen.getByRole("radio", { name: "1게임" }));
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    await screen.findByRole("heading", { name: "추천 번호 (1게임)" });
    await user.click(screen.getByRole("button", { name: "1게임 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "복사" }));
    expect(m.writeText).toHaveBeenCalledWith("1게임 3, 9, 14, 25, 33, 42");
    expect(await screen.findByText("복사했어요")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "공유" }));
    expect(m.share.mock.calls[0]![0].text).toContain("1게임 3, 9, 14, 25, 33, 42");
  });

  it("생성 이력 저장 실패(saved=false)면 즐겨찾기 저장을 막고 복사·공유만", async () => {
    const { m, user } = setup();
    m.generate.mockImplementationOnce(async (r) => ({ ...fakeGenerate(r, 9), saved: false }));
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    expect(await screen.findByText(/즐겨찾기로 저장할 수 없어요/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /선택 \d+개 저장/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("생성 중 중복 제출 잠금·취소(늦게 온 결과는 버림)", async () => {
    const { m, user } = setup();
    let resolve!: (v: ReturnType<typeof fakeGenerate>) => void;
    m.generate.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    expect(screen.getByRole("button", { name: "생성하는 중" })).toBeDisabled();
    expect(screen.getByText("번호를 만드는 중입니다")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "취소" }));
    resolve(fakeGenerate({ game: "lotto", config: { fixed: [], excluded: [], games: 5 } }, 7));
    await waitFor(() => expect(screen.getByRole("button", { name: "추천 번호 생성" })).toBeEnabled());
    expect(screen.getByText("아직 생성한 번호가 없습니다")).toBeInTheDocument();
    expect(m.generate).toHaveBeenCalledTimes(1);
  });

  it("지난 설정 복원(restoreLast): 조건 지정·고정·제외·게임 수를 채우고 같은 조건으로 생성", async () => {
    const m = mockGeneratorCore();
    m.getLast.mockResolvedValue({ fixed: [12, 7], excluded: [1], games: 12 });
    const user = userEvent.setup();
    renderWithNotice(<LottoGenerator core={m.core} links={GEN_LINKS} restoreLast />);
    expect(await screen.findByText(/지난 설정을 불러왔어요/)).toBeInTheDocument();
    expect(m.getLast).toHaveBeenCalledWith("lotto");
    expect(screen.getByRole("radio", { name: "조건 지정" })).toBeChecked();
    expect(screen.getByRole("button", { name: "7번, 고정수" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1번, 제외수" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /직접 입력/ })).toHaveValue("12");
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    expect(m.generate).toHaveBeenCalledWith({ game: "lotto", config: { fixed: [7, 12], excluded: [1], games: 12 } });
  });

  it("지난 설정이 없거나 읽기 실패면 기본값으로 시작 안내", async () => {
    const m = mockGeneratorCore();
    renderWithNotice(<LottoGenerator core={m.core} links={GEN_LINKS} restoreLast />);
    expect(await screen.findByText(/저장된 지난 설정이 없어 기본값으로 시작합니다/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "5게임" })).toBeChecked();
  });
});
