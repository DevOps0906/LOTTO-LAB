// 통계 계산 정본(task-015). P0 앱은 런타임에 계산하지 않고 statistics_cache만 읽는다 — 이 함수는 골든 기준이고
// 워커(task-030, Python)는 test/golden/*.json으로 같은 결과를 맞춘다(결정 ①).
// 결과는 번호(자리·숫자·구간) 순서로만 둔다. 정렬·순위·hot/cold/due 같은 키는 만들지 않는다(결정 ⑦).
import { invalidInput } from "@lotto-lab/lottery-core";
import {
  LOTTO_NUMBER_MAX,
  LOTTO_PICK_COUNT,
  PENSION_DIGITS_LENGTH,
  PENSION_GROUP_MAX,
  type DrawLotto,
  type DrawPension,
  type StatGapEntry,
  type StatMetric,
  type StatWindow,
} from "@lotto-lab/types";
import {
  LOTTO_COMBINATIONS,
  LOTTO_EVEN_COUNT,
  LOTTO_ODD_COUNT,
  LOTTO_RANGES,
  LOTTO_SUM_COUNTS,
  LOTTO_SUM_MIN,
  binomial,
  fraction,
  type Fraction,
} from "./baseline.ts";

export type LottoStatMetric = Extract<StatMetric, `lotto.${string}`>;
export type PensionStatMetric = Extract<StatMetric, `pension.${string}`>;
export type StatLottoDraw = Pick<DrawLotto, "draw_no" | "nums" | "bonus">;
export type StatPensionDraw = Pick<DrawPension, "draw_no" | "group_no" | "digits" | "bonus_digits">;

/** 미출현: gap = 기간 마지막 회차(range.to) − 마지막 출현 회차(draw_no 차이). 기간 안 미출현이면 null + censored. */
export type GapEntry = StatGapEntry;

/**
 * 지표별 values·baseline 형식(인덱스 규칙):
 * - lotto.number_freq(_bonus): values[번호−1] = 출현 횟수, baseline = 표본×6/45(보너스 포함 ×7/45)
 * - lotto.range_dist: values[구간] = 출현 횟수(1~10·11~20·21~30·31~40·41~45), baseline[구간] = 표본×6×구간 크기/45
 * - lotto.odd_even: values[k] = 홀수 k개(0~6)인 회차 수, baseline[k] = 표본×C(23,k)·C(22,6−k)/C(45,6)
 * - lotto.sum_dist: values[합계−21] = 회차 수(합계 21~255), baseline[합계−21] = 표본×N(합계)/C(45,6)
 * - lotto.gap: values[번호−1] = GapEntry, baseline = 기대 간격 45/6
 * - pension.digit_freq·bonus_digit_freq: values[자리−1][숫자] = 횟수, baseline = 표본/10
 * - pension.group_freq: values[조−1] = 횟수, baseline = 표본/5
 */
export type StatResult = {
  metric: StatMetric;
  window: StatWindow;
  range: { from: number; to: number };
  sample_size: number;
  baseline: Fraction | Fraction[];
  values: number[] | number[][] | GapEntry[];
};

/** statistics_cache.payload(@lotto-lab/types StatPayload와 같은 형태). metric·window·range·sample_size는 캐시 열로 간다. */
export type StatPayload = Pick<StatResult, "baseline" | "values">;

/** 계산 결과 → 캐시 payload. 열(range_from·range_to·sample_size)과 중복되는 값은 넣지 않는다. */
export function toCachePayload(result: StatResult): StatPayload {
  return { baseline: result.baseline, values: result.values };
}

export const STAT_WINDOW_SIZES: Readonly<Record<StatWindow, number>> = {
  last10: 10,
  last20: 20,
  last50: 50,
  last100: 100,
  all: Number.POSITIVE_INFINITY,
};

const zeros = (n: number): number[] => new Array<number>(n).fill(0);

/** "최근 N회" = 존재하는 회차 중 draw_no 내림차순 N개(결정 ⑤). */
function selectWindow<T extends { draw_no: number }>(draws: readonly T[], window: StatWindow): T[] {
  return [...draws].sort((a, b) => b.draw_no - a.draw_no).slice(0, STAT_WINDOW_SIZES[window]);
}

type Computed = Pick<StatResult, "baseline" | "values">;

function lottoStat(metric: LottoStatMetric, sample: readonly StatLottoDraw[], rangeTo: number): Computed {
  const n = sample.length;
  switch (metric) {
    case "lotto.number_freq":
    case "lotto.number_freq_bonus": {
      const withBonus = metric === "lotto.number_freq_bonus";
      const values = zeros(LOTTO_NUMBER_MAX);
      for (const d of sample) {
        for (const x of d.nums) values[x - 1]!++;
        if (withBonus) values[d.bonus - 1]!++;
      }
      return { values, baseline: fraction(n * (LOTTO_PICK_COUNT + (withBonus ? 1 : 0)), LOTTO_NUMBER_MAX) };
    }
    case "lotto.range_dist": {
      const values = LOTTO_RANGES.map(([lo, hi]) => sample.reduce((acc, d) => acc + d.nums.filter((x) => x >= lo && x <= hi).length, 0));
      const baseline = LOTTO_RANGES.map(([lo, hi]) => fraction(n * LOTTO_PICK_COUNT * (hi - lo + 1), LOTTO_NUMBER_MAX));
      return { values, baseline };
    }
    case "lotto.odd_even": {
      const values = zeros(LOTTO_PICK_COUNT + 1);
      for (const d of sample) values[d.nums.filter((x) => x % 2 === 1).length]!++;
      const baseline = values.map((_, k) =>
        fraction(n * binomial(LOTTO_ODD_COUNT, k) * binomial(LOTTO_EVEN_COUNT, LOTTO_PICK_COUNT - k), LOTTO_COMBINATIONS),
      );
      return { values, baseline };
    }
    case "lotto.sum_dist": {
      const values = zeros(LOTTO_SUM_COUNTS.length);
      for (const d of sample) values[d.nums.reduce((a, b) => a + b, 0) - LOTTO_SUM_MIN]!++;
      return { values, baseline: LOTTO_SUM_COUNTS.map((c) => fraction(n * c, LOTTO_COMBINATIONS)) };
    }
    case "lotto.gap": {
      // sample은 draw_no 내림차순 — 처음 만난 회차가 마지막 출현
      const last = new Array<number | null>(LOTTO_NUMBER_MAX).fill(null);
      for (const d of sample) for (const x of d.nums) last[x - 1] ??= d.draw_no;
      const values = last.map((at): GapEntry => (at === null ? { gap: null, censored: true } : { gap: rangeTo - at, censored: false }));
      return { values, baseline: fraction(LOTTO_NUMBER_MAX, LOTTO_PICK_COUNT) };
    }
  }
}

function digitCounts(digits: readonly string[]): number[][] {
  const values = Array.from({ length: PENSION_DIGITS_LENGTH }, () => zeros(10));
  for (const s of digits) for (let i = 0; i < PENSION_DIGITS_LENGTH; i++) values[i]![s.charCodeAt(i) - 48]!++;
  return values;
}

function pensionStat(metric: PensionStatMetric, sample: readonly StatPensionDraw[]): Computed {
  const n = sample.length;
  switch (metric) {
    case "pension.digit_freq":
      return { values: digitCounts(sample.map((d) => d.digits)), baseline: fraction(n, 10) };
    case "pension.bonus_digit_freq":
      return { values: digitCounts(sample.map((d) => d.bonus_digits)), baseline: fraction(n, 10) };
    case "pension.group_freq": {
      const values = zeros(PENSION_GROUP_MAX);
      for (const d of sample) values[d.group_no - 1]!++;
      return { values, baseline: fraction(n, PENSION_GROUP_MAX) };
    }
  }
}

/**
 * 지표 하나를 계산한다. 표본 0이면 null(캐시 행 미생성 → A-06 0행 = 미갱신, 결정 ⑤).
 * 입력 회차는 검증(validation DrawLotto·DrawPension) 통과분이라고 전제한다. 지표와 게임이 다르면 INVALID_INPUT.
 */
export function computeStat(game: "lotto", metric: LottoStatMetric, window: StatWindow, draws: readonly StatLottoDraw[]): StatResult | null;
export function computeStat(game: "pension", metric: PensionStatMetric, window: StatWindow, draws: readonly StatPensionDraw[]): StatResult | null;
export function computeStat(
  game: "lotto" | "pension",
  metric: StatMetric,
  window: StatWindow,
  draws: readonly (StatLottoDraw | StatPensionDraw)[],
): StatResult | null {
  if (!metric.startsWith(`${game}.`)) throw invalidInput("statistics.metric_game_mismatch");
  const sample = selectWindow(draws, window);
  if (sample.length === 0) return null;
  const range = { from: sample[sample.length - 1]!.draw_no, to: sample[0]!.draw_no };
  const computed =
    game === "lotto"
      ? lottoStat(metric as LottoStatMetric, sample as StatLottoDraw[], range.to)
      : pensionStat(metric as PensionStatMetric, sample as StatPensionDraw[]);
  return { metric, window, range, sample_size: sample.length, baseline: computed.baseline, values: computed.values };
}
