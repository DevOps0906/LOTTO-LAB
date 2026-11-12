// D-11 Windows 온보딩: M-05 로직 그대로, 창 가운데 카드 배치(layout="card")만 다르다.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Onboarding } from "../src";

async function toAgeStep(user: ReturnType<typeof userEvent.setup>, answer: string) {
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "다음" }));
  await user.click(screen.getByRole("radio", { name: answer }));
  await user.click(screen.getByRole("button", { name: "다음" }));
}

describe("D-11 Windows 온보딩", () => {
  it("카드 배치 표시 + 미체크면 다음 비활성(빈 상태)", () => {
    const { container } = render(<Onboarding layout="card" confirm={vi.fn()} onDone={vi.fn()} />);
    expect(container.querySelector(".ll-onboarding")).toHaveAttribute("data-layout", "card");
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  });

  it("기본(모바일)은 배치 표시가 없다", () => {
    const { container } = render(<Onboarding confirm={vi.fn()} onDone={vi.fn()} />);
    expect(container.querySelector(".ll-onboarding")).not.toHaveAttribute("data-layout");
  });

  it("19세 확인 → 게스트로 시작: 확인 기록 저장 후 대시보드로", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn(async () => {});
    const onDone = vi.fn();
    render(<Onboarding layout="card" confirm={confirm} onDone={onDone} />);
    await toAgeStep(user, "네, 만 19세 이상입니다");
    await user.click(screen.getByRole("button", { name: "게스트로 시작" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("미성년이면 종료 안내(카드 배치 유지)", async () => {
    const user = userEvent.setup();
    const { container } = render(<Onboarding layout="card" confirm={vi.fn()} onDone={vi.fn()} />);
    await toAgeStep(user, "아니요, 만 19세 미만입니다");
    expect(screen.getByText("만 19세 이상만 이용할 수 있습니다")).toBeInTheDocument();
    expect(container.querySelector(".ll-onboarding")).toHaveAttribute("data-layout", "card");
  });
});
