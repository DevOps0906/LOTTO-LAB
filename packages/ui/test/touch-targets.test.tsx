// jsdom은 레이아웃을 계산하지 않으므로, 내 번호·구매 등록·설정 화면(M-07·M-08·M-09·M-12)이 쓰는 누름 요소의
// CSS 높이를 토큰 값으로 계산해 터치 영역 44px 이상인지 확인한다(DESIGN 4.1·5장).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;
const tokens = readFileSync(path.join(here, "..", "..", "design-tokens", "tokens.css"), "utf8");
const css = readFileSync(path.join(here, "..", "src", "styles.css"), "utf8") + readFileSync(path.join(here, "..", "src", "screens", "screens.css"), "utf8");
const themeBlock = /@theme\s*\{([\s\S]*?)\n\}/.exec(tokens)?.[1] ?? "";
const TOUCH = 44;

function token(name: string): number {
  const m = new RegExp(String.raw`${name}:\s*([\d.]+)px`).exec(themeBlock);
  if (!m) throw new Error(`토큰 없음: ${name}`);
  return Number(m[1]);
}

/** "calc(var(--spacing) * 11)" · "var(--spacing-control)" → px */
function evaluate(value: string): number {
  const calc = /^calc\(var\((--[\w-]+)\) \* ([\d.]+)\)$/.exec(value.trim());
  if (calc) return token(calc[1]!) * Number(calc[2]);
  const v = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (v) return token(v[1]!);
  throw new Error(`계산할 수 없는 값: ${value}`);
}

/** 선택자(그룹 선택자 포함) 규칙에서 min-height 또는 height의 최댓값(px). */
function heightOf(selector: string): number {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rules = [...css.matchAll(new RegExp(String.raw`(?:^|[},]\s*)${esc}\s*(?:,[^{]*)?\{([^}]*)\}`, "gm"))].map((m) => m[1]!);
  const values = rules.flatMap((body) => [...body.matchAll(/(?:^|;|\s)(?:min-height|height):\s*([^;]+);/g)].map((m) => evaluate(m[1]!)));
  if (values.length === 0) throw new Error(`높이 규칙 없음: ${selector}`);
  return Math.max(...values);
}

describe("새 화면 누름 요소 터치 영역 ≥ 44px", () => {
  it.each([
    [".ll-button", "구매 등록·삭제·내보내기 등 버튼"],
    [".ll-icon-button", "설정 톱니·⋯ 메뉴"],
    [".ll-link", "상세 링크·공식 결과 보기"],
    [".ll-tabs__tab", "M-07 탭"],
    [".ll-seg__item span", "복권·정렬·조·금액·테마 세그먼트"],
    [".ll-check", "실제 구매 확인·회차 나중에 입력 체크"],
    [".ll-input", "검색·번호·회차·구매일·확인 문구 입력"],
  ])("%s (%s)", (selector) => {
    expect(heightOf(selector)).toBeGreaterThanOrEqual(TOUCH);
  });
});
