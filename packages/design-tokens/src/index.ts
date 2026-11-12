// 디자인 토큰 TS 상수 — 값은 tokens.css(정답 소스)에만 있다. 여기에는 이름·경계·매핑만 둔다.
// 이름 목록이 tokens.css와 어긋나면 test/tokens.test.ts가 실패한다.

/** 반응형 3구간 경계(최소 폭, CSS px). DESIGN.md 2장: 모바일 ~767 / 태블릿 768~1199 / 데스크톱 1200~ */
export const BREAKPOINTS = { tablet: 768, desktop: 1200 } as const;

export type Breakpoint = "mobile" | "tablet" | "desktop";

/** 폭(CSS px) → 구간. DESIGN.md 2장 경계 그대로. */
export function breakpointOf(width: number): Breakpoint {
  if (width >= BREAKPOINTS.desktop) return "desktop";
  if (width >= BREAKPOINTS.tablet) return "tablet";
  return "mobile";
}

/** matchMedia용 쿼리(tokens.css @media와 같은 경계). */
export const MEDIA = {
  tablet: `(width >= ${BREAKPOINTS.tablet}px)`,
  desktop: `(width >= ${BREAKPOINTS.desktop}px)`,
} as const;

export const COLOR_TOKENS = [
  "bg", "surface", "text", "text-muted", "border", "input", "focus",
  "navy", "navy-fg", "navy-muted",
  "primary", "primary-fg", "primary-soft", "primary-soft-fg",
  "pension", "pension-fg", "pension-soft", "pension-soft-fg",
  "success", "success-fg", "warning", "warning-fg", "danger", "danger-fg",
  "ball-1", "ball-1-fg", "ball-11", "ball-11-fg", "ball-21", "ball-21-fg",
  "ball-31", "ball-31-fg", "ball-41", "ball-41-fg", "ball-empty", "ball-empty-fg",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-grid",
  "heat-1", "heat-2", "heat-3", "heat-4", "heat-5",
] as const;

/** 3구간마다 값이 바뀌는 글자 크기 토큰(DESIGN.md 3장). */
export const TEXT_TOKENS = ["display", "h1", "h2", "body", "caption", "kpi", "ball"] as const;
export const FONT_TOKENS = ["sans", "mono"] as const;
export const SPACING_TOKENS = [
  "page", "gap", "control", "ball", "tabbar", "sidebar", "sidebar-rail",
] as const;
export const RADIUS_TOKENS = ["control", "card", "pill"] as const;
export const SHADOW_TOKENS = ["card", "raised", "cta"] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type TextToken = (typeof TEXT_TOKENS)[number];
export type FontToken = (typeof FONT_TOKENS)[number];
export type SpacingToken = (typeof SPACING_TOKENS)[number];
export type RadiusToken = (typeof RADIUS_TOKENS)[number];
export type ShadowToken = (typeof SHADOW_TOKENS)[number];

/** CSS 변수 전체 이름(`--color-bg` 등). `--spacing`은 4의 배수 계산용 기본 단위. */
export type TokenVar =
  | `--color-${ColorToken}`
  | `--text-${TextToken}`
  | `--font-${FontToken}`
  | "--spacing"
  | `--spacing-${SpacingToken}`
  | `--radius-${RadiusToken}`
  | `--shadow-${ShadowToken}`;

export const TOKEN_VARS: readonly TokenVar[] = [
  ...COLOR_TOKENS.map((n) => `--color-${n}` as const),
  ...TEXT_TOKENS.map((n) => `--text-${n}` as const),
  ...FONT_TOKENS.map((n) => `--font-${n}` as const),
  "--spacing",
  ...SPACING_TOKENS.map((n) => `--spacing-${n}` as const),
  ...RADIUS_TOKENS.map((n) => `--radius-${n}` as const),
  ...SHADOW_TOKENS.map((n) => `--shadow-${n}` as const),
];

/** `var(--토큰)` 문자열. 인라인 style에서도 값 대신 토큰을 쓰게 한다. */
export function cssVar(name: TokenVar): string {
  return `var(${name})`;
}

/** 번호공 구간(DESIGN.md 4.1): 1~10 b1 · 11~20 b11 · 21~30 b21 · 31~40 b31 · 41~45 b41. */
export type BallRange = "b1" | "b11" | "b21" | "b31" | "b41";

export const LOTTO_MIN = 1;
export const LOTTO_MAX = 45;

/** 로또 번호 → 번호대. 1~45 정수가 아니면 RangeError. */
export function ballRange(n: number): BallRange {
  if (!Number.isInteger(n) || n < LOTTO_MIN || n > LOTTO_MAX) {
    throw new RangeError(`로또 번호는 ${LOTTO_MIN}~${LOTTO_MAX} 정수여야 한다: ${n}`);
  }
  if (n <= 10) return "b1";
  if (n <= 20) return "b11";
  if (n <= 30) return "b21";
  if (n <= 40) return "b31";
  return "b41";
}

/** 번호대의 배경·글자 색 토큰 변수. */
export function ballColorVars(n: number): { bg: TokenVar; fg: TokenVar } {
  const start = ballRange(n).slice(1) as "1" | "11" | "21" | "31" | "41";
  return { bg: `--color-ball-${start}`, fg: `--color-ball-${start}-fg` };
}
