import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InstallButtons } from "@/components/InstallButtons";

function setup() {
  const user = userEvent.setup();
  render(
    <main>
      <a href="/">배경 링크</a>
      <InstallButtons />
    </main>,
  );
  return user;
}

describe("W-01 설치 안내 모달", () => {
  it("열면 닫기에 포커스, 배경은 inert", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Android 설치 안내" }));
    const dialog = screen.getByRole("dialog", { name: "Android 앱은 준비 중이에요" });
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();
    expect(dialog.closest("[inert]")).toBeNull();
    expect(screen.getByText("배경 링크").closest("[inert]")).not.toBeNull();
  });

  it("Tab·Shift+Tab이 모달 안에서 순환", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Windows 설치 안내" }));
    const close = screen.getByRole("button", { name: "닫기" });
    const cta = screen.getByRole("link", { name: "사전알림 신청하기" });
    expect(close).toHaveFocus();
    await user.tab();
    expect(cta).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(cta).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it("닫으면(버튼·Esc) 여는 버튼으로 포커스 복귀, inert 해제", async () => {
    const user = setup();
    const opener = screen.getByRole("button", { name: "Android 설치 안내" });
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
    expect(document.querySelector("[inert]")).toBeNull();

    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
});
