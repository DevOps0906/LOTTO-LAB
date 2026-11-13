import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BREAKPOINTS, TOKEN_VARS, ballColorVars, ballRange, breakpointOf, cssVar } from "../src/index";

const css = readFileSync(path.join(import.meta.dirname, "..", "tokens.css"), "utf8");
const themeBlock = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
const themeVars = [...themeBlock.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]);

describe("토큰 이름", () => {
  it("TS 목록과 tokens.css @theme 변수가 정확히 같다", () => {
    expect([...TOKEN_VARS].sort()).toEqual([...themeVars].sort());
  });

  it("3구간 경계가 tokens.css @media와 같다", () => {
    expect(css).toContain(`@media (width >= ${BREAKPOINTS.tablet}px)`);
    expect(css).toContain(`@media (width >= ${BREAKPOINTS.desktop}px)`);
  });

  it("cssVar는 var() 문자열을 만든다", () => {
    expect(cssVar("--color-primary")).toBe("var(--color-primary)");
  });
});

describe("breakpointOf", () => {
  it.each([
    [375, "mobile"], [767, "mobile"], [768, "tablet"], [1199, "tablet"], [1200, "desktop"], [1440, "desktop"],
  ] as const)("%i → %s", (w, bp) => {
    expect(breakpointOf(w)).toBe(bp);
  });
});

describe("ballRange", () => {
  it.each([
    [1, "b1"], [10, "b1"], [11, "b11"], [20, "b11"], [21, "b21"], [30, "b21"], [31, "b31"], [40, "b31"], [41, "b41"], [45, "b41"],
  ] as const)("%i → %s", (n, r) => {
    expect(ballRange(n)).toBe(r);
  });

  it("1~45 모든 번호의 색 토큰이 tokens.css에 있다", () => {
    for (let n = 1; n <= 45; n++) {
      const { bg, fg } = ballColorVars(n);
      expect(themeVars).toContain(bg);
      expect(themeVars).toContain(fg);
    }
  });

  it.each([0, 46, 1.5, Number.NaN, -1])("범위 밖 %s는 RangeError", (n) => {
    expect(() => ballRange(n)).toThrow(RangeError);
  });
});
