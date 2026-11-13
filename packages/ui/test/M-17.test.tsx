import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GenerateSelect, ThemeGenerator, type FortuneCore, type FortuneRequestInput } from "../src";
import { engineError, mockGeneratorCore, renderWithNotice } from "./generator-core";

const LINKS = { home: "#/", generate: "#/generate", lotto: "#/generate/lotto" };
const DREAM = { keywords: [{ id: "pig", label: "돼지" }, { id: "water", label: "물" }, { id: "fire", label: "불" }, { id: "gold", label: "금" }], max: 3 };
const NUMS = [[3, 9, 14, 25, 33, 42], [1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18], [19, 20, 21, 22, 23, 24]];

type Result = Awaited<ReturnType<FortuneCore["fortune"]["generate"]>>;

/** 결정적 목: 같은 요청이면 같은 번호(배치 id만 다름). method는 테마 종류로 정한다. */
function setup(impl?: (request: FortuneRequestInput) => Promise<Result>) {
  const m = mockGeneratorCore();
  let batchNo = 0;
  const generate = vi.fn(
    impl ??
      (async (request: FortuneRequestInput): Promise<Result> => {
        const batch_id = `fortune-${++batchNo}`;
        const kind = request.theme.kind;
        const method = kind === "zodiac_sign" || kind === "zodiac_animal" ? "zodiac" : kind === "anniversary" ? "birthday" : kind;
        if (request.game === "pension") {
          return {
            batch_id,
            method,
            saved: true,
            records: request.groups.map((g) => ({ id: `${batch_id}-${g}`, game: "pension" as const, numbers: { digits: "000719" }, group_no: g })),
          };
        }
        return {
          batch_id,
          method,
          saved: true,
          records: NUMS.map((nums, i) => ({ id: `${batch_id}-${i + 1}`, game: "lotto" as const, numbers: { nums }, group_no: null })),
        };
      }),
  );
  const core = { ...(m.core as object), fortune: { generate } } as unknown as FortuneCore;
  const user = userEvent.setup();
  renderWithNotice(<ThemeGenerator core={core} links={LINKS} dream={DREAM} />);
  return { m, generate, user };
}

const submit = () => screen.getByRole("button", { name: "오늘의 번호 생성" });

describe("M-17 테마 번호", () => {
  it("빈 상태: 테마 미선택이면 생성 비활성·안내·고지 표시, 입력값 미전송 안내", () => {
    setup();
    expect(submit()).toBeDisabled();
    expect(screen.getByText("테마를 고르면 생성할 수 있어요.")).toBeInTheDocument();
    expect(screen.getByText("재미·참고용 · 전통 상징 해석이며 당첨 확률과 무관")).toBeInTheDocument();
    expect(screen.getByText(/서버로 보내거나 저장하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByText(/같은 날 같은 입력은 같은 번호/)).toBeInTheDocument();
    expect(screen.getByText("아직 만든 번호가 없습니다")).toBeInTheDocument();
    for (const name of ["별자리", "띠", "생년월일", "기념일", "행운 숫자", "꿈"]) {
      expect(within(screen.getByRole("radiogroup", { name: "테마" })).getByRole("radio", { name })).toBeInTheDocument();
    }
  });

  it("별자리 선택 → 생성: 번호 5게임·테마 출처·저장 상태·고지, 같은 입력은 같은 번호", async () => {
    const { generate, m, user } = setup();
    await user.click(screen.getByRole("radio", { name: "사자자리" }));
    await user.click(submit());
    expect(generate).toHaveBeenCalledWith({ game: "lotto", theme: { kind: "zodiac_sign", sign: "leo" } });
    expect(await screen.findByRole("heading", { name: "오늘의 테마 번호 (5게임)" })).toBeInTheDocument();
    expect(screen.getByText(/테마 출처/)).toHaveTextContent("테마 출처 별자리·띠 · 생성 이력에 저장됨");
    const first = screen.getByRole("list", { name: "1게임 번호" });
    expect(within(first).getAllByRole("listitem").map((li) => li.textContent)).toStrictEqual(["3", "9", "14", "25", "33", "42"]);
    expect(screen.getAllByText(/전통 상징 해석이며 당첨 확률과 무관/).length).toBeGreaterThanOrEqual(2);

    // 같은 날 같은 입력은 같은 번호라 다시 생성 버튼은 없다 — 생성 버튼으로 다시 누르면 같은 요청이 간다.
    expect(screen.queryByRole("button", { name: "같은 조건으로 다시 생성" })).not.toBeInTheDocument();
    await user.click(submit());
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    expect(generate.mock.calls[1]![0]).toStrictEqual(generate.mock.calls[0]![0]);
    expect(within(await screen.findByRole("list", { name: "1게임 번호" })).getAllByRole("listitem").map((li) => li.textContent)).toStrictEqual([
      "3", "9", "14", "25", "33", "42",
    ]);

    // 선택 저장 → 즐겨찾기(구매 아님)
    await user.click(screen.getByRole("checkbox", { name: "1게임 선택" }));
    await user.click(screen.getByRole("button", { name: "선택 1개 저장" }));
    expect(m.saveFromGenerated).toHaveBeenCalledWith("fortune-2-1", expect.objectContaining({ purchase_status: "favorite", round: null }));
  });

  it("띠·생년월일·꿈(최대 3개)·연금: 테마별 요청 모양", async () => {
    const { generate, user } = setup();
    await user.click(screen.getByRole("radio", { name: "띠" }));
    await user.click(screen.getByRole("radio", { name: "용띠" }));
    await user.click(submit());
    expect(generate).toHaveBeenLastCalledWith({ game: "lotto", theme: { kind: "zodiac_animal", animal: "dragon" } });

    await user.click(screen.getByRole("radio", { name: "생년월일" }));
    expect(submit()).toBeDisabled();
    await user.type(screen.getByLabelText("생년월일 날짜"), "1987-03-21");
    await user.click(submit());
    expect(generate).toHaveBeenLastCalledWith({ game: "lotto", theme: { kind: "birthday", date: "1987-03-21" } });

    await user.click(screen.getByRole("radio", { name: "꿈" }));
    for (const name of ["돼지", "물", "불"]) await user.click(screen.getByRole("checkbox", { name }));
    expect(screen.getByRole("checkbox", { name: "금" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "연금복권 720+" }));
    await user.click(submit());
    expect(generate).toHaveBeenLastCalledWith({ game: "pension", groups: [1, 2, 3, 4, 5], theme: { kind: "dream", keywords: ["pig", "water", "fire"] } });
    expect(await screen.findByRole("heading", { name: "오늘의 테마 번호 (5장)" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "추천 번호 목록" })).toHaveTextContent("1조000719");
  });

  it("행운 숫자는 생성하지 않고 M-02 고정 번호로 연결", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("radio", { name: "행운 숫자" }));
    expect(screen.getByRole("link", { name: "행운 숫자는 고정 번호 설정" })).toHaveAttribute("href", "#/generate/lotto");
    expect(submit()).toBeDisabled();
  });

  it("오류: 입력 오류는 필드 옆, 엔진 충돌 안내, 그 밖의 실패는 다시 시도(이전 결과 보존)", async () => {
    let next: Error | null = engineError("fortune.birthday", {}, "INVALID_INPUT");
    const ok = { batch_id: "b-1", method: "birthday", saved: false, records: NUMS.map((nums, i) => ({ id: `b-1-${i}`, game: "lotto" as const, numbers: { nums }, group_no: null })) };
    const { user } = setup(async () => {
      if (next) {
        const e = next;
        next = null;
        throw e;
      }
      return ok;
    });
    await user.click(screen.getByRole("radio", { name: "생년월일" }));
    await user.type(screen.getByLabelText("생년월일 날짜"), "2999-01-01");
    await user.click(submit());
    expect(await screen.findByText(/1900-01-01부터 오늘까지/)).toBeInTheDocument();
    expect(screen.getByLabelText("생년월일 날짜")).toHaveAttribute("aria-invalid", "true");

    await user.click(submit());
    expect(await screen.findByText(/생성 이력에 저장하지 못함/)).toBeInTheDocument();
    expect(screen.getByText(/즐겨찾기로 저장할 수 없어요/)).toBeInTheDocument();

    next = engineError("lotto.too_few_combinations", { max: 0, requested: 5 });
    await user.click(submit());
    expect(await screen.findByText("고정 번호와 충돌해 번호를 만들 수 없어요")).toBeInTheDocument();

    next = new Error("boom");
    await user.click(submit());
    expect(await screen.findByText("번호를 만들지 못했어요")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "1게임 번호" })).toBeInTheDocument();
  });

  it("생성 중 버튼 잠금·취소하면 늦게 온 결과를 버린다", async () => {
    let resolve: (r: Result) => void = () => {};
    const { user, generate } = setup(() => new Promise<Result>((r) => (resolve = r)));
    await user.click(screen.getByRole("radio", { name: "양자리" }));
    await user.click(submit());
    expect(screen.getByRole("button", { name: "생성하는 중" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "취소" }));
    resolve({ batch_id: "late", method: "zodiac", saved: true, records: [] });
    await waitFor(() => expect(screen.getByText("아직 만든 번호가 없습니다")).toBeInTheDocument());
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe("M-15 테마 번호 진입", () => {
  it("links.theme이 있으면 버튼, 없으면 숨김", () => {
    const core = { generator: { history: async () => [] } } as unknown as Parameters<typeof GenerateSelect>[0]["core"];
    const base = { home: "#/", lotto: "#/l", pension: "#/p", lottoLast: "#/l?last", pensionLast: "#/p?last" };
    const { unmount } = renderWithNotice(<GenerateSelect core={core} links={{ ...base, theme: "#/generate/theme" }} />);
    expect(screen.getByRole("link", { name: "운세·테마 번호" })).toHaveAttribute("href", "#/generate/theme");
    unmount();
    renderWithNotice(<GenerateSelect core={core} links={base} />);
    expect(screen.queryByRole("link", { name: "운세·테마 번호" })).not.toBeInTheDocument();
  });

  it("links.saju가 있으면 사주 번호(회원) 링크, 없으면 숨김", () => {
    const m2 = mockGeneratorCore();
    const core = { ...(m2.core as object), fortune: { generate: vi.fn() } } as unknown as FortuneCore;
    const { unmount } = renderWithNotice(<ThemeGenerator core={core} links={{ ...LINKS, saju: "#/fortune/saju" }} dream={DREAM} />);
    expect(screen.getByRole("link", { name: "사주 번호(회원)" })).toHaveAttribute("href", "#/fortune/saju");
    unmount();
    renderWithNotice(<ThemeGenerator core={core} links={LINKS} dream={DREAM} />);
    expect(screen.queryByRole("link", { name: "사주 번호(회원)" })).not.toBeInTheDocument();
  });
});
