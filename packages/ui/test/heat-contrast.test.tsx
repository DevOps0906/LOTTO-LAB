// 히트맵 칸 대비(M-04): screens.css의 단계별 배경·글자 토큰 쌍을 tokens.css 라이트(@theme)·다크(.dark) 값으로 계산해 4.5:1 이상인지 고정한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tokensCss = readFileSync(resolve(import.meta.dirname, "../../design-tokens/tokens.css"), "utf8");
const screensCss = readFileSync(resolve(import.meta.dirname, "../src/screens/screens.css"), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}
const darkAt = tokensCss.indexOf(".dark {");
const light = tokens(tokensCss.slice(0, darkAt));
const dark = { ...light, ...tokens(tokensCss.slice(darkAt)) };

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

describe("히트맵 단계별 대비", () => {
  for (const level of [1, 2, 3, 4, 5]) {
    it(`단계 ${level}: 라이트·다크 모두 4.5:1 이상`, () => {
      const rule = new RegExp(`\\.ll-heat__cell\\[data-level="${level}"\\]\\s*\\{([^}]*)\\}`).exec(screensCss)?.[1] ?? "";
      const bg = /background:\s*var\((--color-[a-z0-9-]+)\)/.exec(rule)?.[1];
      const fg = /(?:^|\s)color:\s*var\((--color-[a-z0-9-]+)\)/.exec(rule)?.[1];
      expect(bg).toBe(`--color-heat-${level}`);
      expect(fg).toBeDefined();
      for (const mode of [light, dark]) {
        expect(contrast(mode[bg!]!, mode[fg!]!)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
