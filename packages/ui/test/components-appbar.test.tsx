// task-047 L1 앱바: 뒤로가기 · 가운데 제목(h1) · 정보(i) → 바텀시트(기존 안내 문구).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppBar } from "../src/components/AppBar";

describe("AppBar", () => {
  it("뒤로가기 링크와 h1 제목, 정보 버튼을 누르면 안내 시트가 열리고 닫힌다", async () => {
    render(<AppBar title="로또 6/45" backHref="#/generate" info={{ title: "로또 생성", content: <p>당첨을 보장하지 않습니다.</p> }} />);
    expect(screen.getByRole("heading", { level: 1, name: "로또 6/45" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로 가기" })).toHaveAttribute("href", "#/generate");
    expect(screen.queryByText("당첨을 보장하지 않습니다.")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "로또 생성 안내" }));
    const dialog = screen.getByRole("dialog", { name: "로또 생성" });
    expect(dialog).toHaveTextContent("당첨을 보장하지 않습니다.");
    await userEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("backHref가 없으면 onBack 버튼, 둘 다 없고 info도 없으면 제목만", async () => {
    const onBack = vi.fn();
    const { unmount } = render(<AppBar title="통계" onBack={onBack} backLabel="홈으로" />);
    await userEvent.click(screen.getByRole("button", { name: "홈으로" }));
    expect(onBack).toHaveBeenCalledOnce();
    unmount();

    render(<AppBar title="통계" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
