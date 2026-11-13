// statistics 테스트(task-015): 골든 파일 대조(task-030 Python 재사용)·표본 0·허용 키 목록·기준선 정확값·속성.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EngineError } from "@lotto-lab/lottery-core";
import { STAT_METRICS, STAT_WINDOWS, type StatMetric, type StatWindow } from "@lotto-lab/types";
import {
  LOTTO_COMBINATIONS,
  LOTTO_SUM_COUNTS,
  computeStat,
  toCachePayload,
  fraction,
  type Fraction,
  type GapEntry,
  type LottoStatMetric,
  type PensionStatMetric,
  type StatLottoDraw,
  type StatPensionDraw,
  type StatResult,
} from "../src/index.ts";
import emptyLottoGolden from "./golden/empty-lotto.json";
import emptyPensionGolden from "./golden/empty-pension.json";
import lottoLargeGolden from "./golden/lotto-large.json";
import lottoGolden from "./golden/lotto.json";
import pensionLargeGolden from "./golden/pension-large.json";
import pensionGolden from "./golden/pension.json";

type Golden = {
  game: "lotto" | "pension";
  draws: (StatLottoDraw | StatPensionDraw)[];
  cases: { metric: StatMetric; window: StatWindow; expected: StatResult | null }[];
};

function run(game: "lotto" | "pension", metric: StatMetric, window: StatWindow, draws: readonly unknown[]): StatResult | null {
  return game === "lotto"
    ? computeStat("lotto", metric as LottoStatMetric, window, draws as StatLottoDraw[])
    : computeStat("pension", metric as PensionStatMetric, window, draws as StatPensionDraw[]);
}

const GOLDENS: Record<string, Golden> = {
  lotto: lottoGolden as Golden,
  pension: pensionGolden as Golden,
  "lotto-large": lottoLargeGolden as Golden,
  "pension-large": pensionLargeGolden as Golden,
  "empty-lotto": emptyLottoGolden as Golden,
  "empty-pension": emptyPensionGolden as Golden,
};

describe("골든 파일(test/golden/*.json — 입력 회차 + 기대 결과, Python 독립 구현으로 생성)", () => {
  it("모든 지표 × 기간 조합을 빠짐없이 담는다", () => {
    for (const [name, golden] of Object.entries(GOLDENS)) {
      const metrics = STAT_METRICS.filter((m) => m.startsWith(`${golden.game}.`));
      expect(golden.cases.map((c) => `${c.metric}/${c.window}`), name).toStrictEqual(
        metrics.flatMap((m) => STAT_WINDOWS.map((w) => `${m}/${w}`)),
      );
    }
  });

  for (const [name, golden] of Object.entries(GOLDENS)) {
    it(`${name}: 계산 결과 = 기대 결과(구조 비교)`, () => {
      for (const c of golden.cases) {
        expect(run(golden.game, c.metric, c.window, golden.draws), `${c.metric}/${c.window}`).toStrictEqual(c.expected);
      }
    });
  }

  it("큰 세트(108회, 결번 3개): 기간 5종의 표본·범위가 모두 다르다", () => {
    for (const golden of [lottoLargeGolden, pensionLargeGolden] as Golden[]) {
      expect(golden.draws.length).toBe(108);
      const first = golden.cases.filter((c) => c.metric === golden.cases[0]!.metric).map((c) => c.expected!);
      expect(first.map((e) => e.sample_size)).toStrictEqual([10, 20, 50, 100, 108]);
      expect(new Set(first.map((e) => e.range.from)).size).toBe(5);
    }
  });

  it("입력 순서와 무관하다(draw_no 기준)", () => {
    const reversed = [...lottoGolden.draws].reverse();
    for (const c of (lottoGolden as Golden).cases) expect(run("lotto", c.metric, c.window, reversed)).toStrictEqual(c.expected);
  });
});

describe("기간·표본", () => {
  const draws: StatLottoDraw[] = [3, 1, 7, 5].map((draw_no) => ({ draw_no, nums: [1, 2, 3, 4, 5, 6], bonus: 7 }));

  it("표본 0이면 null(캐시 행 미생성)", () => {
    for (const w of STAT_WINDOWS) {
      expect(computeStat("lotto", "lotto.number_freq", w, [])).toBeNull();
      expect(computeStat("pension", "pension.group_freq", w, [])).toBeNull();
    }
  });

  it("최근 N회 = 존재하는 회차 중 draw_no 내림차순 N개, 범위는 그 회차의 최소·최대", () => {
    const r = computeStat("lotto", "lotto.number_freq", "all", draws)!;
    expect(r.range).toStrictEqual({ from: 1, to: 7 });
    expect(r.sample_size).toBe(4);
    const many: StatLottoDraw[] = Array.from({ length: 120 }, (_, i) => ({ draw_no: 1000 - i * 2, nums: [1, 2, 3, 4, 5, 6], bonus: 7 }));
    const sizes = { last10: 10, last20: 20, last50: 50, last100: 100, all: 120 };
    for (const w of STAT_WINDOWS) {
      const s = computeStat("lotto", "lotto.number_freq", w, many)!;
      expect(s.sample_size).toBe(sizes[w]);
      expect(s.range).toStrictEqual({ from: 1000 - (sizes[w] - 1) * 2, to: 1000 });
    }
  });

  it("미출현: draw_no 차이, 기간 안 미출현은 gap null·censored true", () => {
    const g: StatLottoDraw[] = [
      { draw_no: 10, nums: [1, 2, 3, 4, 5, 6], bonus: 45 },
      { draw_no: 7, nums: [1, 7, 8, 9, 10, 11], bonus: 44 },
    ];
    const v = computeStat("lotto", "lotto.gap", "all", g)!.values as GapEntry[];
    expect(v[0]).toStrictEqual({ gap: 0, censored: false });
    expect(v[6]).toStrictEqual({ gap: 3, censored: false });
    expect(v[44]).toStrictEqual({ gap: null, censored: true }); // 보너스는 미출현 판단에 쓰지 않는다
  });

  it("지표와 게임이 다르면 INVALID_INPUT", () => {
    const call = () => run("pension", "lotto.number_freq", "all", draws);
    expect(call).toThrow(EngineError);
    expect(call).toThrow(/statistics\.metric_game_mismatch/);
  });
});

describe("캐시 payload", () => {
  it("toCachePayload는 baseline·values만 담는다(나머지는 캐시 열)", () => {
    const r = computeStat("lotto", "lotto.odd_even", "all", [{ draw_no: 1, nums: [1, 2, 3, 4, 5, 6], bonus: 7 }])!;
    expect(toCachePayload(r)).toStrictEqual({ baseline: r.baseline, values: r.values });
    expect(Object.keys(toCachePayload(r)).sort()).toStrictEqual(["baseline", "values"]);
  });
});

describe("기준선 정확값(결정 ③)", () => {
  it("기약분수", () => {
    expect(fraction(12, 45)).toStrictEqual({ num: 4, den: 15 });
    expect(fraction(0, 7)).toStrictEqual({ num: 0, den: 1 });
  });

  it("합계 분포: 총합 C(45,6), 평균 138, 대칭, 최소·최대 1가지", () => {
    expect(LOTTO_SUM_COUNTS.length).toBe(235);
    expect(LOTTO_SUM_COUNTS.reduce((a, b) => a + b, 0)).toBe(LOTTO_COMBINATIONS);
    expect(LOTTO_COMBINATIONS).toBe(8_145_060);
    expect(LOTTO_SUM_COUNTS.reduce((acc, c, i) => acc + c * (i + 21), 0)).toBe(138 * LOTTO_COMBINATIONS);
    for (let i = 0; i < 235; i++) expect(LOTTO_SUM_COUNTS[i]).toBe(LOTTO_SUM_COUNTS[234 - i]);
    expect(LOTTO_SUM_COUNTS[0]).toBe(1);
  });

  it("지표별 기준선(표본 10)", () => {
    const d: StatLottoDraw[] = Array.from({ length: 10 }, (_, i) => ({ draw_no: i + 1, nums: [1, 2, 3, 4, 5, 6], bonus: 7 }));
    const p: StatPensionDraw[] = Array.from({ length: 10 }, (_, i) => ({ draw_no: i + 1, group_no: 1, digits: "000719", bonus_digits: "123456" }));
    expect(computeStat("lotto", "lotto.number_freq", "all", d)!.baseline).toStrictEqual({ num: 4, den: 3 });
    expect(computeStat("lotto", "lotto.number_freq_bonus", "all", d)!.baseline).toStrictEqual({ num: 14, den: 9 });
    expect(computeStat("lotto", "lotto.range_dist", "all", d)!.baseline).toStrictEqual([
      ...Array.from({ length: 4 }, () => ({ num: 40, den: 3 })),
      { num: 20, den: 3 },
    ]);
    expect(computeStat("lotto", "lotto.gap", "all", d)!.baseline).toStrictEqual({ num: 15, den: 2 });
    const oe = computeStat("lotto", "lotto.odd_even", "all", d)!.baseline as Fraction[];
    expect(oe[3]).toStrictEqual(fraction(10 * 1771 * 1540, LOTTO_COMBINATIONS));
    expect(computeStat("pension", "pension.digit_freq", "all", p)!.baseline).toStrictEqual({ num: 1, den: 1 });
    expect(computeStat("pension", "pension.group_freq", "all", p)!.baseline).toStrictEqual({ num: 2, den: 1 });
    expect((computeStat("pension", "pension.digit_freq", "all", p)!.values as number[][])[0]![0]).toBe(10); // 앞자리 0 보존
  });
});

// 결과에 들어갈 수 있는 키 전체(결정 ⑦). 정렬·순위·예측 성격 키는 금지.
const ALLOWED_KEYS = new Set(["metric", "window", "range", "from", "to", "sample_size", "baseline", "values", "num", "den", "gap", "censored"]);
const FORBIDDEN = /hot|cold|due|rank|score|predict|top|trend|recommend|prob/i;

function collectKeys(value: unknown, into: Set<string>): Set<string> {
  if (Array.isArray(value)) for (const v of value) collectKeys(v, into);
  else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      collectKeys(v, into);
    }
  }
  return into;
}

function collectNumbers(value: unknown, into: number[] = []): number[] {
  if (typeof value === "number") into.push(value);
  else if (Array.isArray(value)) for (const v of value) collectNumbers(v, into);
  else if (value !== null && typeof value === "object") for (const v of Object.values(value)) collectNumbers(v, into);
  return into;
}

const lottoDraw = fc
  .uniqueArray(fc.integer({ min: 1, max: 45 }), { minLength: 7, maxLength: 7 })
  .map((xs) => ({ nums: xs.slice(0, 6).sort((a, b) => a - b), bonus: xs[6]! }));
const lottoDraws = fc
  .uniqueArray(fc.integer({ min: 1, max: 2000 }), { minLength: 1, maxLength: 130 })
  .chain((nos) => fc.tuple(fc.constant(nos), fc.array(lottoDraw, { minLength: nos.length, maxLength: nos.length })))
  .map(([nos, ds]) => nos.map((draw_no, i): StatLottoDraw => ({ draw_no, ...ds[i]! })));
const digitString = fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 6, maxLength: 6 }).map((xs) => xs.join(""));
const pensionDraws = fc
  .uniqueArray(fc.integer({ min: 1, max: 2000 }), { minLength: 1, maxLength: 130 })
  .chain((nos) =>
    fc.tuple(
      fc.constant(nos),
      fc.array(fc.record({ group_no: fc.integer({ min: 1, max: 5 }), digits: digitString, bonus_digits: digitString }), {
        minLength: nos.length,
        maxLength: nos.length,
      }),
    ),
  )
  .map(([nos, ds]) => nos.map((draw_no, i): StatPensionDraw => ({ draw_no, ...ds[i]! })));
const windowArb = fc.constantFrom(...STAT_WINDOWS);
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const LOTTO_METRICS = STAT_METRICS.filter((m): m is LottoStatMetric => m.startsWith("lotto."));
const PENSION_METRICS = STAT_METRICS.filter((m): m is PensionStatMetric => m.startsWith("pension."));

describe("속성", () => {
  it("허용 키만, 숫자는 모두 정수, 분모 > 0 기약분수", () => {
    const check = (r: StatResult) => {
      const keys = collectKeys(r, new Set());
      for (const k of keys) {
        expect(ALLOWED_KEYS.has(k), k).toBe(true);
        expect(FORBIDDEN.test(k), k).toBe(false);
      }
      for (const n of collectNumbers(r)) expect(Number.isSafeInteger(n)).toBe(true);
      const fractions = Array.isArray(r.baseline) ? r.baseline : [r.baseline];
      for (const f of fractions) {
        expect(f.den).toBeGreaterThan(0);
        expect(fraction(f.num, f.den)).toStrictEqual(f);
      }
    };
    fc.assert(
      fc.property(lottoDraws, windowArb, (draws, w) => {
        for (const m of LOTTO_METRICS) check(computeStat("lotto", m, w, draws)!);
      }),
      { numRuns: 60 },
    );
    fc.assert(
      fc.property(pensionDraws, windowArb, (draws, w) => {
        for (const m of PENSION_METRICS) check(computeStat("pension", m, w, draws)!);
      }),
      { numRuns: 60 },
    );
  });

  it("로또: 빈도 합 = 표본×6(보너스 포함 ×7), 구간 합 = 표본×6, 홀짝·합계 합 = 표본, 기준선 합 = 표본", () => {
    fc.assert(
      fc.property(lottoDraws, windowArb, (draws, w) => {
        const n = computeStat("lotto", "lotto.number_freq", w, draws)!.sample_size;
        expect(n).toBe(Math.min(draws.length, { last10: 10, last20: 20, last50: 50, last100: 100, all: Infinity }[w]));
        expect(sum(computeStat("lotto", "lotto.number_freq", w, draws)!.values as number[])).toBe(n * 6);
        expect(sum(computeStat("lotto", "lotto.number_freq_bonus", w, draws)!.values as number[])).toBe(n * 7);
        expect(sum(computeStat("lotto", "lotto.range_dist", w, draws)!.values as number[])).toBe(n * 6);
        for (const m of ["lotto.odd_even", "lotto.sum_dist"] as const) {
          const r = computeStat("lotto", m, w, draws)!;
          expect(sum(r.values as number[])).toBe(n);
          // Σ num/den = n — 분모를 C(45,6)로 맞춰 정수로 비교
          const total = (r.baseline as Fraction[]).reduce((acc, f) => acc + (f.num * LOTTO_COMBINATIONS) / f.den, 0);
          expect(total).toBe(n * LOTTO_COMBINATIONS);
        }
        const gap = computeStat("lotto", "lotto.gap", w, draws)!;
        for (const e of gap.values as GapEntry[]) {
          expect(e.censored).toBe(e.gap === null);
          if (e.gap !== null) expect(e.gap).toBeLessThanOrEqual(gap.range.to - gap.range.from);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("연금: 자리별 숫자 합 = 표본, 조 합 = 표본", () => {
    fc.assert(
      fc.property(pensionDraws, windowArb, (draws, w) => {
        const n = computeStat("pension", "pension.group_freq", w, draws)!.sample_size;
        expect(sum(computeStat("pension", "pension.group_freq", w, draws)!.values as number[])).toBe(n);
        for (const m of ["pension.digit_freq", "pension.bonus_digit_freq"] as const) {
          for (const row of computeStat("pension", m, w, draws)!.values as number[][]) expect(sum(row)).toBe(n);
        }
      }),
      { numRuns: 100 },
    );
  });
});
