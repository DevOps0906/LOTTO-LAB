// jsdom은 레이아웃을 계산하지 않으므로, 토큰·CSS 값을 읽어 좁은 폭에서 그리드가 넘치지 않는지 계산으로 확인한다.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;
const tokens = readFileSync(path.join(here, "..", "..", "design-tokens", "tokens.css"), "utf8");
const styles = readFileSync(path.join(here, "..", "src", "styles.css"), "utf8");
const themeBlock = /@theme\s*\{([\s\S]*?)\n\}/.exec(tokens)?.[1] ?? "";

function px(name: string): number {
  const m = new RegExp(String.raw`${name}:\s*([\d.]+)px`).exec(themeBlock);
  if (!m) throw new Error(`토큰 없음: ${name}`);
  return Number(m[1]);
}

const spacing = px("--spacing");
const page = px("--spacing-page"); // 모바일 기준값
const ball = px("--spacing-ball");
const touch = spacing * 11; // styles.css .ll-ball-grid__cell min-height

/** styles.css에서 폭 w에 적용되는 열 수 */
function columnsAt(w: number): number {
  let cols = Number(/\.ll-cols-6\s*\{\s*grid-template-columns:\s*repeat\((\d+)/.exec(styles)?.[1]);
  for (const m of styles.matchAll(/@media \(width >= ([\d.]+)em\)\s*\{(?:\s*\/\*[^*]*\*\/)?\s*\.ll-ball-grid\.ll-cols-\w+-\d+\s*\{\s*grid-template-columns:\s*repeat\((\d+)/g)) {
    if (w >= Number(m[1]) * 16) cols = Number(m[2]);
  }
  return cols;
}

describe("번호 그리드 좁은 폭 넘침 없음", () => {
  it("열 간격 0 — 셀이 열 너비를 꽉 채운다", () => {
    expect(styles).toMatch(/\.ll-ball-grid \{[^}]*column-gap: 0;/);
  });

  it.each([
    [320, 6],
    [360, 6],
    [389, 6],
    [390, 7],
    [767, 7],
    [768, 9],
  ])("%ipx → %i열", (w, cols) => {
    expect(columnsAt(w)).toBe(cols);
  });

  it.each([320, 360, 390])("%ipx: 페이지 여백 안에서 열 너비 ≥ 공 지름·터치 44", (w) => {
    const colWidth = (w - page * 2) / columnsAt(w);
    expect(colWidth).toBeGreaterThanOrEqual(ball);
    expect(colWidth).toBeGreaterThanOrEqual(touch);
  });
});
