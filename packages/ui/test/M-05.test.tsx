import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Onboarding } from "../src";

async function toStart(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("checkbox", { name: /서비스 안내를 확인했습니다/ }));
  await user.click(screen.getByRole("button", { name: "다음" }));
  await user.click(screen.getByRole("radio", { name: "네, 만 19세 이상입니다" }));
  await user.click(screen.getByRole("button", { name: "다음" }));
}

describe("M-05 온보딩·19세 확인", () => {
  it("빈: 확인 항목 미체크면 다음 비활성 + 안내 문구, 판매·구매대행 없음 안내", () => {
    render(<Onboarding confirm={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
    expect(screen.getByText("필수 항목을 선택하면 다음으로 넘어갈 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByText(/복권을 판매하지 않으며, 구매 대행·중개를 하지 않습니다/)).toBeInTheDocument();
  });

  it("미성년이면 종료 안내로 끝나고 확인 기록을 남기지 않는다", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    const onExit = vi.fn();
    render(<Onboarding confirm={confirm} onDone={vi.fn()} onExit={onExit} />);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "아니요, 만 19세 미만입니다" }));
    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("만 19세 이상만 이용할 수 있습니다")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "앱 종료" }));
    expect(onExit).toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("거절(종료)도 종료 안내", async () => {
    const user = userEvent.setup();
    render(<Onboarding confirm={vi.fn()} onDone={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "종료" }));
    expect(screen.getByText("이용을 마칩니다")).toBeInTheDocument();
  });

  it("성공: 확인 기록 저장 중 시작 잠금 → 저장 후 홈으로, 로그인은 P1 비활성", async () => {
    const user = userEvent.setup();
    let resolve: () => void = () => {};
    const confirm = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    const onDone = vi.fn();
    render(<Onboarding confirm={confirm} onDone={onDone} />);
    await toStart(user);
    expect(screen.getByRole("button", { name: "로그인 (준비 중)" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "게스트로 시작" }));
    expect(screen.getByRole("button", { name: "게스트로 시작" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("확인 기록을 저장하는 중입니다");
    resolve();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("오류: 저장 실패는 재시도 안내", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn().mockRejectedValueOnce(new Error("STORAGE_FAILED")).mockResolvedValueOnce("2026-11-12T00:00:00.000Z");
    const onDone = vi.fn();
    render(<Onboarding confirm={confirm} onDone={onDone} />);
    await toStart(user);
    await user.click(screen.getByRole("button", { name: "게스트로 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("확인 기록을 저장하지 못했습니다");
    expect(onDone).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
