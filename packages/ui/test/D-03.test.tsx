// D-03 Windows 연금 생성: M-03 로직 그대로, 조건(좌)·결과(우). 연금 번호는 문자열(000719 앞자리 0 보존).
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PensionGenerator } from "../src";
import { GEN_LINKS, mockGeneratorCore, renderWithNotice } from "./generator-core";

const LABELS = ["십만", "만", "천", "백", "십", "일"];

describe("D-03 Windows 연금 생성", () => {
  it("split 배치 + 연금 맥락, 오프라인 모의 생성 → 000719 보존 복사, 공유 버튼 없음", async () => {
    const m = mockGeneratorCore();
    const user = userEvent.setup();
    const view = renderWithNotice(<PensionGenerator core={m.core} links={GEN_LINKS} layout="split" canShare={false} />);
    const gen = view.container.querySelector(".ll-gen")!;
    expect(gen).toHaveAttribute("data-layout", "split");
    expect(gen).toHaveAttribute("data-game", "pension");
    expect(screen.queryByRole("navigation", { name: "현재 위치" })).toBeNull();
    for (const [i, label] of LABELS.entries()) await user.type(screen.getByRole("textbox", { name: label + " 자리" }), "000719"[i]!);
    await user.click(screen.getByRole("button", { name: "번호 생성" }));
    expect(m.generate).toHaveBeenCalledWith({ game: "pension", config: { groups: [1], positions: ["0", "0", "0", "7", "1", "9"], games: 1 } });
    const list = await screen.findByRole("list", { name: "추천 번호 목록" });
    expect(list).toHaveTextContent("000719");
    expect(screen.queryByRole("button", { name: "공유" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "전체 복사" }));
    expect(m.writeText).toHaveBeenCalledWith(expect.stringContaining("000719"));
  });
});
