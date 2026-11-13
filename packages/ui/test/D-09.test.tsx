// D-09 Windows 설정: M-12 재사용(768~ 2열 그리드). Windows 공유는 클립보드 복사라 "내보내기(공유)"를 숨긴다.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Settings } from "../src";
import { fakeSettingsCore, renderWithNotice } from "./ticket-core";

describe("D-09 Windows 설정", () => {
  it("canShare=false: JSON 복사만, 2열 그리드, 테마·권한 상태", async () => {
    const f = fakeSettingsCore();
    const { container } = renderWithNotice(
      <Settings core={f.core} appVersion="0.1.0" onThemeChange={vi.fn()} onCleared={vi.fn()} canShare={false} />,
    );
    expect(screen.getByText("설정을 불러오는 중입니다")).toBeInTheDocument();
    expect(await screen.findByRole("radiogroup", { name: "테마" })).toBeInTheDocument();
    expect(container.querySelector(".ll-settings__grid")).toBeInTheDocument();
    expect(screen.getByText("기기 권한")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내보내기(공유)" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "내보내기(JSON 복사)" }));
    expect(f.core.adapters.clipboard.writeText).toHaveBeenCalled();
    expect(await screen.findByText("복사했어요")).toBeInTheDocument();
  });

  it("기본(모바일)은 공유 버튼이 그대로 있다", async () => {
    const f = fakeSettingsCore();
    renderWithNotice(<Settings core={f.core} appVersion="0.1.0" onThemeChange={vi.fn()} onCleared={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "내보내기(공유)" })).toBeInTheDocument();
  });
});
