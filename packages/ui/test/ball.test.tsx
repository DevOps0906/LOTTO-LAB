import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Ball, BallGrid } from "../src";

describe("Ball", () => {
  it.each([
    ["default", "7번"],
    ["selected", "7번, 선택됨"],
    ["fixed", "7번, 고정수"],
    ["excluded", "7번, 제외수"],
    ["unselected", "7번"],
  ] as const)("%s 상태 aria 라벨 = %s", (state, label) => {
    render(<Ball number={7} state={state} />);
    const ball = screen.getByRole("img", { name: label });
    expect(ball).toHaveAttribute("data-state", state);
    expect(ball).toHaveTextContent("7");
  });

  it("번호대 색 클래스를 붙인다", () => {
    render(
      <>
        <Ball number={10} />
        <Ball number={11} />
        <Ball number={45} />
      </>,
    );
    expect(screen.getByRole("img", { name: "10번" })).toHaveClass("ll-ball", "b1");
    expect(screen.getByRole("img", { name: "11번" })).toHaveClass("b11");
    expect(screen.getByRole("img", { name: "45번" })).toHaveClass("b41");
  });

  it("보너스는 '+' 기호와 '보너스' 라벨", () => {
    render(<Ball number={33} state="bonus" />);
    const bonus = screen.getByRole("img", { name: "보너스 33번" });
    expect(bonus).toHaveTextContent("+33");
  });

  it("선택·고정·제외는 아이콘 배지를 병기한다(색만으로 전달 금지)", () => {
    const { container } = render(
      <>
        <Ball number={2} state="selected" />
        <Ball number={3} state="fixed" />
        <Ball number={4} state="excluded" />
        <Ball number={5} state="default" />
        <Ball number={6} state="unselected" />
      </>,
    );
    const badges = container.querySelectorAll(".ll-ball__badge");
    expect(badges).toHaveLength(3);
    for (const b of badges) expect(b).toHaveAttribute("aria-hidden", "true");
  });

  it("범위 밖 번호는 RangeError", () => {
    expect(() => render(<Ball number={46} />)).toThrow(RangeError);
  });
});

function Controlled({ fixed, excluded }: { fixed?: number[]; excluded?: number[] }) {
  const [selected, setSelected] = useState<number[]>([]);
  return (
    <BallGrid
      label="번호 선택"
      selected={selected}
      fixed={fixed}
      excluded={excluded}
      onToggle={(n) => setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]))}
    />
  );
}

describe("BallGrid", () => {
  it("1~45 버튼 45개, ~389 6열·390~ 7열·768~ 9열 클래스", () => {
    render(<Controlled />);
    const group = screen.getByRole("group", { name: "번호 선택" });
    expect(group).toHaveClass("ll-ball-grid", "ll-cols-6", "ll-cols-sm-7", "ll-cols-md-9");
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(45);
    expect(buttons[0]).toHaveAccessibleName("1번");
    expect(buttons[44]).toHaveAccessibleName("45번");
    expect(buttons[0]).toHaveClass("ll-ball-grid__cell");
  });

  it("누르면 aria-pressed와 공 상태가 토글된다", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const btn = screen.getByRole("button", { name: "12번" });
    const ball = btn.querySelector(".ll-ball");
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(ball).toHaveAttribute("data-state", "unselected");

    await user.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(ball).toHaveAttribute("data-state", "selected");
    expect(ball).toHaveClass("b11");

    await user.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("고정은 포함(aria-pressed=true)·제외는 미포함, 이름에 상태를 넣고 공은 보조기기에서 숨긴다", () => {
    render(<Controlled fixed={[5]} excluded={[40]} />);
    expect(screen.getByRole("button", { name: "5번, 고정수" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "40번, 제외수" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});
