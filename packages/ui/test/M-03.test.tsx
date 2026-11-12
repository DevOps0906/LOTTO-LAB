import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PensionGenerator } from "../src";
import { GEN_LINKS, engineError, mockGeneratorCore, renderWithNotice } from "./generator-core";

const LABELS = ["십만", "만", "천", "백", "십", "일"];

function setup(restoreLast = false) {
  const m = mockGeneratorCore();
  const user = userEvent.setup();
  const view = renderWithNotice(<PensionGenerator core={m.core} links={GEN_LINKS} restoreLast={restoreLast} />);
  return { m, user, view };
}
const rows = () => Array.from(screen.getByRole("list", { name: "추천 번호 목록" }).querySelectorAll<HTMLElement>(".ll-result__row"));

async function typeDigits(user: ReturnType<typeof userEvent.setup>, digits: string) {
  for (const [i, label] of LABELS.entries()) await user.type(screen.getByRole("textbox", { name: `${label} 자리` }), digits[i]!);
}

describe("M-03 연금 생성", () => {
  it("빈 상태: 낱장·1조·모든 자리 자동, 숫자 입력 필드(type=number) 없음", () => {
    const { view } = setup();
    expect(screen.getByText("아직 생성한 번호가 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "낱장(조 1개)" })).toBeChecked();
    expect(screen.getByRole("button", { name: "1조" })).toHaveAttribute("aria-pressed", "true");
    for (const label of LABELS) expect(screen.getByRole("textbox", { name: `${label} 자리` })).toHaveValue("");
    expect(view.container.querySelector('input[type="number"]')).toBeNull();
    expect(screen.getByText(/총/)).toHaveTextContent("기본 번호 1개 × 조 1개 = 총 1장");
  });

  it("1조 000719 입력 → 생성 → 저장 → 복사 문자열이 000719(앞자리 0 유지)", async () => {
    const { m, user } = setup();
    await typeDigits(user, "000719");
    await user.click(screen.getByRole("button", { name: "번호 생성" }));
    expect(m.generate).toHaveBeenCalledWith({ game: "pension", config: { groups: [1], positions: ["0", "0", "0", "7", "1", "9"], games: 1 } });
    await screen.findByRole("heading", { name: "추천 번호 (총 1장)" });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("1조");
    expect(rows()[0]).toHaveTextContent("000719");
    await user.click(screen.getByRole("checkbox", { name: "1조 000719 선택" }));
    await user.click(screen.getByRole("button", { name: "선택 1개 저장" }));
    expect(m.saveFromGenerated).toHaveBeenCalledWith("batch-1-1-1", { purchase_status: "favorite", round: null, idempotency_key: "key-1" });
    expect(await screen.findByText("저장했어요")).toBeInTheDocument();
    expect(within(rows()[0]!).getByText("즐겨찾기 저장됨")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "1조 000719 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "복사" }));
    expect(m.writeText).toHaveBeenCalledWith("1조 000719");
    expect(m.writeText.mock.calls[0]![0].split(" ")[1]).toBe("000719");
    expect(m.saveLast).toHaveBeenCalledWith({ game: "pension", config: { groups: [1], positions: ["0", "0", "0", "7", "1", "9"], games: 1 } });
  });

  it("5조 세트: 1~5조 모두 같은 번호 5장, 기본 번호 수와 총 장수를 구분해 표시", async () => {
    const { m, user } = setup();
    await user.click(screen.getByRole("radio", { name: "5조 세트" }));
    for (const g of [1, 2, 3, 4, 5]) expect(screen.getByRole("button", { name: `${g}조` })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/총/, { selector: ".ll-gen__summary" })).toHaveTextContent("기본 번호 1개 × 조 5개 = 총 5장");
    await typeDigits(user, "000719");
    await user.click(screen.getByRole("button", { name: "세트 생성" }));
    expect(m.generate).toHaveBeenCalledWith({ game: "pension", config: { groups: [1, 2, 3, 4, 5], positions: ["0", "0", "0", "7", "1", "9"], games: 1 } });
    await screen.findByRole("heading", { name: "추천 번호 (5조 세트 · 총 5장)" });
    expect(rows()).toHaveLength(5);
    expect(rows().map((r) => r.querySelector(".ll-result__label")!.textContent)).toEqual(["1조", "2조", "3조", "4조", "5조"]);
    expect(rows().every((r) => r.textContent!.includes("000719"))).toBe(true);
    // 체크박스·메뉴 이름은 조와 여섯 자리를 포함해 서로 겹치지 않고, 라벨(44×44 히트 영역)에 연결된다.
    const names = screen.getAllByRole("checkbox").filter((c) => c.closest(".ll-result")).map((c) => c.getAttribute("aria-label") ?? c.closest("label")!.textContent);
    expect(names).toEqual(["1조 000719 선택", "2조 000719 선택", "3조 000719 선택", "4조 000719 선택", "5조 000719 선택"]);
    expect(screen.getByRole("checkbox", { name: "3조 000719 선택" }).closest("label")).toHaveClass("ll-result__check");
    expect(screen.getByRole("button", { name: "5조 000719 메뉴" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "5개" }));
    expect(screen.getByText(/총/, { selector: ".ll-gen__summary" })).toHaveTextContent("기본 번호 5개 × 조 5개 = 총 25장");
  });

  it("선택 조: 여러 조, 0개면 생성 잠금", async () => {
    const { m, user } = setup();
    await user.click(screen.getByRole("radio", { name: "선택 조" }));
    await user.click(screen.getByRole("button", { name: "3조" }));
    await user.click(screen.getByRole("button", { name: "1조" }));
    await user.click(screen.getByRole("button", { name: "3조" }));
    expect(screen.getByText("조를 1개 이상 고르세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "번호 생성" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "2조" }));
    await user.click(screen.getByRole("button", { name: "5조" }));
    await user.click(screen.getByRole("button", { name: "번호 생성" }));
    expect(m.generate).toHaveBeenCalledWith({ game: "pension", config: { groups: [2, 5], positions: [null, null, null, null, null, null], games: 1 } });
  });

  it("자리 입력은 숫자 한 글자 문자열만(문자는 무시, 비우면 자동)", async () => {
    const { user } = setup();
    const box = screen.getByRole("textbox", { name: "십만 자리" });
    await user.type(box, "a");
    expect(box).toHaveValue("");
    await user.type(box, "0");
    expect(box).toHaveValue("0");
    await user.click(screen.getByRole("button", { name: "모든 자리 자동으로" }));
    expect(box).toHaveValue("");
  });

  it("불가능 조건(고정 여섯 자리 + 기본 번호 여러 개): 안내 → 기본 번호 수 줄이기·모든 자리 자동", async () => {
    const { m, user } = setup();
    m.generate.mockRejectedValueOnce(engineError("pension.too_few_combinations", { max: 1, requested: 5 }));
    await typeDigits(user, "000719");
    await user.click(screen.getByRole("radio", { name: "5개" }));
    await user.click(screen.getByRole("button", { name: "번호 생성" }));
    const box = (await screen.findByText("고정한 자리가 많아 서로 다른 번호가 부족해요")).closest<HTMLElement>(".ll-gen__problem")!;
    expect(box).toHaveAttribute("role", "alert");
    expect(box).toHaveTextContent("최대 1개");
    expect(box).toHaveTextContent("요청 5개");
    expect(within(box).getByRole("button", { name: "모든 자리 자동으로" })).toBeInTheDocument();
    await user.click(within(box).getByRole("button", { name: "기본 번호 수를 1개로 줄이기" }));
    expect(screen.getByRole("radio", { name: "1개" })).toBeChecked();
    expect(screen.queryByText("고정한 자리가 많아 서로 다른 번호가 부족해요")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "번호 생성" }));
    await waitFor(() => expect(rows()).toHaveLength(1));
  });

  it("rng_exhausted: 줄이기 대신 잠시 후 다시 생성 안내 + 다시 생성 버튼", async () => {
    const { m, user } = setup();
    m.generate.mockRejectedValueOnce(engineError("pension.rng_exhausted", { max: 100000, requested: 5 }));
    await user.click(screen.getByRole("button", { name: "번호 생성" }));
    const box = (await screen.findByText("이번에는 번호를 다 만들지 못했어요")).closest<HTMLElement>(".ll-gen__problem")!;
    expect(box).toHaveTextContent("잠시 후 다시 생성해 주세요");
    expect(within(box).queryByRole("button", { name: /줄이기/ })).not.toBeInTheDocument();
    await user.click(within(box).getByRole("button", { name: "다시 생성" }));
    expect(m.generate).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(rows()).toHaveLength(1));
  });

  it("too_few_combinations라도 최대가 요청 이상이면 줄이기 버튼을 숨긴다", async () => {
    const { m, user } = setup();
    m.generate.mockRejectedValueOnce(engineError("pension.too_few_combinations", { max: 10, requested: 5 }));
    await user.click(screen.getByRole("button", { name: "번호 생성" }));
    const box = (await screen.findByText("고정한 자리가 많아 서로 다른 번호가 부족해요")).closest<HTMLElement>(".ll-gen__problem")!;
    expect(within(box).queryByRole("button", { name: /줄이기/ })).not.toBeInTheDocument();
  });

  it("지난 설정 복원: 선택 조·자리(앞자리 0 문자열)·기본 번호 수", async () => {
    const m = mockGeneratorCore();
    m.getLast.mockResolvedValue({ groups: [2, 4], positions: ["0", null, null, null, null, "9"], games: 3 });
    const user = userEvent.setup();
    renderWithNotice(<PensionGenerator core={m.core} links={GEN_LINKS} restoreLast />);
    expect(await screen.findByText(/지난 설정을 불러왔어요/)).toBeInTheDocument();
    expect(m.getLast).toHaveBeenCalledWith("pension");
    expect(screen.getByRole("radio", { name: "선택 조" })).toBeChecked();
    expect(screen.getByRole("button", { name: "2조" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "4조" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "십만 자리" })).toHaveValue("0");
    expect(screen.getByRole("textbox", { name: "일 자리" })).toHaveValue("9");
    expect(screen.getByRole("textbox", { name: /직접 입력/ })).toHaveValue("3");
    await user.click(screen.getByRole("button", { name: "번호 생성" }));
    expect(m.generate).toHaveBeenCalledWith({ game: "pension", config: { groups: [2, 4], positions: ["0", null, null, null, null, "9"], games: 3 } });
    await screen.findByRole("heading", { name: "추천 번호 (총 6장)" });
  });

  it("지난 설정 읽기 실패면 기본값으로 시작", async () => {
    const m = mockGeneratorCore();
    m.getLast.mockRejectedValue(new Error("STORAGE_FAILED"));
    renderWithNotice(<PensionGenerator core={m.core} links={GEN_LINKS} restoreLast />);
    expect(await screen.findByText(/지난 설정을 읽지 못해 기본값으로 시작합니다/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "낱장(조 1개)" })).toBeChecked();
  });
});
