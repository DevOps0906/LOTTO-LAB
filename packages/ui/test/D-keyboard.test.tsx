// Windows D-02 키보드 흐름: 사이드바 → 생성 조건 폼 → 생성 → 결과 줄 ⋯ 메뉴 → Esc로 닫으면 메뉴 버튼으로 포커스 복귀.
// + 다크 "구매 기록" 배지 테두리 대비(카드 면 대비 3:1 이상, WCAG 1.4.11)를 토큰 값으로 고정한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppShell, LottoGenerator } from "../src";
import { GEN_LINKS, mockGeneratorCore, renderWithNotice } from "./generator-core";

const SIDE = ["대시보드", "로또 생성", "연금 생성", "통계", "내 번호", "회차", "알림", "설정"].map((label, i) => ({
  href: `#/${i}`,
  label,
  icon: null,
  current: label === "로또 생성",
}));

/** 원하는 요소에 포커스가 올 때까지 Tab(최대 n번). */
async function tabTo(user: ReturnType<typeof userEvent.setup>, target: HTMLElement, n = 120) {
  for (let i = 0; i < n && document.activeElement !== target; i++) await user.tab();
  expect(target).toHaveFocus();
}

describe("D-02 키보드 흐름", () => {
  it("사이드바 → 조건 폼 → 생성(Enter) → 결과 ⋯ 메뉴(Enter·↓) → Esc 닫기 후 메뉴 버튼으로 복귀", async () => {
    const m = mockGeneratorCore();
    const user = userEvent.setup();
    renderWithNotice(
      <AppShell brandMark={null} brandName="LOTTO LAB" tabItems={[]} sideItems={SIDE}>
        <LottoGenerator core={m.core} links={GEN_LINKS} layout="split" canShare={false} />
      </AppShell>,
    );
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    const links = nav.querySelectorAll("a");
    links[links.length - 1]!.focus();
    await user.tab();
    // 사이드바 다음 Tab은 본문 조건 폼(좌측 카드)으로 들어간다.
    expect(document.activeElement?.closest(".ll-gen__cond")).not.toBeNull();

    await tabTo(user, screen.getByRole("button", { name: "추천 번호 생성" }));
    await user.keyboard("{Enter}");
    await screen.findByRole("list", { name: "추천 번호 목록" });

    const trigger = screen.getByRole("button", { name: "1게임 메뉴" });
    await tabTo(user, trigger);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "즐겨찾기로 저장" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "복사" })).toHaveFocus();
    expect(screen.queryByRole("menuitem", { name: "공유" })).toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});

const tokensCss = readFileSync(resolve(import.meta.dirname, "../../design-tokens/tokens.css"), "utf8");
const screensCss = readFileSync(resolve(import.meta.dirname, "../src/screens/screens.css"), "utf8");
function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}
const darkAt = tokensCss.indexOf(".dark {");
const dark = { ...tokens(tokensCss.slice(0, darkAt)), ...tokens(tokensCss.slice(darkAt)) };
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("다크 구매 기록 배지 테두리", () => {
  it("테두리 토큰은 다크 카드 면(--color-surface) 대비 3:1 이상", () => {
    const rule = /\.dark \.ll-badge\[data-status="purchased"\]\s*\{([^}]*)\}/.exec(screensCss)?.[1] ?? "";
    const border = /border-color:\s*var\((--color-[a-z0-9-]+)\)/.exec(rule)?.[1];
    expect(border).toBeDefined();
    expect(contrast(dark[border!]!, dark["--color-surface"]!)).toBeGreaterThanOrEqual(3);
    // 참고: --color-border는 장식용이라 3:1 미만 — 그래서 쓰지 않는다.
    expect(contrast(dark["--color-border"]!, dark["--color-surface"]!)).toBeLessThan(3);
  });
});
