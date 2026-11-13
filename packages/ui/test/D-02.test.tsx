// D-02 Windows 로또 생성: M-02 로직 그대로, 768~에서도 조건(좌)·결과(우)(data-layout="split"). 공유 = 복사라 공유 버튼 숨김.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LottoGenerator } from "../src";
import { GEN_LINKS, engineError, mockGeneratorCore, renderWithNotice } from "./generator-core";

function setup() {
  const m = mockGeneratorCore();
  const user = userEvent.setup();
  const view = renderWithNotice(<LottoGenerator core={m.core} links={GEN_LINKS} layout="split" canShare={false} />);
  return { m, user, view };
}

describe("D-02 Windows 로또 생성", () => {
  it("split 배치: 좌 조건 카드·우 결과 열, 이동 경로 없음, 생성 전 안내", () => {
    const { view } = setup();
    const gen = view.container.querySelector(".ll-gen")!;
    expect(gen).toHaveAttribute("data-layout", "split");
    const layout = gen.querySelector(".ll-gen__layout")!;
    expect(layout.children[0]).toHaveClass("ll-gen__cond");
    expect(layout.children[1]).toHaveClass("ll-gen__col");
    expect(screen.queryByRole("navigation", { name: "현재 위치" })).toBeNull();
    expect(screen.getByText("아직 생성한 번호가 없습니다")).toBeInTheDocument();
  });

  it("오프라인 모의에서 생성 성공 → 복사만(공유 없음), 줄 메뉴에도 공유 없음", async () => {
    const { m, user } = setup();
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    const list = await screen.findByRole("list", { name: "추천 번호 목록" });
    expect(list.querySelectorAll(".ll-result__row")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: "공유" })).toBeNull();
    await user.click(within(list).getByRole("button", { name: "1게임 메뉴" }));
    expect(screen.getByRole("menuitem", { name: "복사" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "공유" })).toBeNull();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "전체 복사" }));
    expect(m.writeText).toHaveBeenCalled();
  });

  it("오류: 엔진 충돌이면 기존 결과를 유지하고 조건 문제를 보인다", async () => {
    const { m, user, view } = setup();
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    await screen.findByRole("list", { name: "추천 번호 목록" });
    m.generate.mockRejectedValueOnce(engineError("조건을 만족하는 조합이 없습니다", { fixed: 1 }));
    await user.click(screen.getByRole("button", { name: "추천 번호 생성" }));
    expect(await screen.findByRole("list", { name: "추천 번호 목록" })).toBeInTheDocument();
    expect(view.container.querySelector(".ll-gen__problem")).toBeInTheDocument();
  });
});
