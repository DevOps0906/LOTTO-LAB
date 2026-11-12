// statistics_cache payload → 차트·표 데이터(표시 전용). 형식은 @lotto-lab/statistics computeStat 주석(task-015 정본):
// values는 번호·구간·홀수 개수·합계·자리 순서 그대로 쓴다(정렬·순위 없음). 기준선은 정수 분수 → 표시용 소수.
// 형식이 맞지 않으면 null — 화면은 기준선 없는 수치를 보이지 않는다.
import type { StatMetric, StatRow } from "../common/data";

export type BarDatum = {
  key: string;
  /** 가로축 라벨(번호·구간 등) */
  label: string;
  /** 막대 높이 값(미출현 censored는 기간 길이) */
  value: number;
  /** 막대 위 값(미출현 censored는 "N회 이상" — 차트·표 같은 문구) */
  short: string;
  /** 표에 쓰는 값 */
  full: string;
  /** 이 막대의 기준선(표시용 소수) */
  baseline: number;
  /** 기간 안에 한 번도 나오지 않음(미출현 간격 ≥ 기간 길이) */
  censored: boolean;
};

export type StatChart =
  /** single = 모든 막대 공통 기준선(가로선 하나), null이면 막대마다 기준선 */
  /** gap = 미출현 간격 지표(합계가 의미 없음) */
  | { kind: "bars"; bars: BarDatum[]; single: number | null; gap: boolean }
  | { kind: "heat"; rows: { key: string; label: string; cells: number[] }[]; baseline: number };

type Fraction = { num: number; den: number };

function isCount(v: unknown): v is number {
  return Number.isSafeInteger(v) && (v as number) >= 0;
}

function fractionValue(f: unknown): number | null {
  if (typeof f !== "object" || f === null || Array.isArray(f)) return null;
  const { num, den } = f as Partial<Fraction>;
  return isCount(num) && Number.isSafeInteger(den) && (den as number) > 0 ? num / (den as number) : null;
}

/** values가 길이 n의 횟수 배열이면 그대로, 아니면 null. */
function counts(values: unknown, n: number): number[] | null {
  return Array.isArray(values) && values.length === n && values.every(isCount) ? (values as number[]) : null;
}

/** 기준선: 분수 1개(single) 또는 길이 n 분수 배열(perBar). */
function baselines(baseline: unknown, n: number): { single: number | null; perBar: number[] } | null {
  if (Array.isArray(baseline)) {
    if (baseline.length !== n) return null;
    const perBar = baseline.map(fractionValue);
    return perBar.every((b): b is number => b !== null) ? { single: null, perBar } : null;
  }
  const single = fractionValue(baseline);
  return single === null ? null : { single, perBar: new Array<number>(n).fill(single) };
}

function bars(labels: string[], values: number[], base: { single: number | null; perBar: number[] }, unit: string): StatChart {
  return {
    kind: "bars",
    single: base.single,
    gap: false,
    bars: values.map((v, i) => ({
      key: String(i),
      label: labels[i]!,
      value: v,
      short: String(v),
      full: `${v.toLocaleString("ko-KR")}${unit}`,
      baseline: base.perBar[i]!,
      censored: false,
    })),
  };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
const LOTTO_RANGES = ["1~10", "11~20", "21~30", "31~40", "41~45"];
const SUM_MIN = 21;
const SUM_COUNT = 235; // 합계 21~255
const SUM_BIN = 10;
const PENSION_POSITIONS = ["첫째 자리", "둘째 자리", "셋째 자리", "넷째 자리", "다섯째 자리", "여섯째 자리"];

/** 지표별 payload → 차트 데이터. 형식 불일치면 null. */
export function statChart(metric: StatMetric, row: StatRow): StatChart | null {
  const { values, baseline } = row.payload;
  switch (metric) {
    case "lotto.number_freq":
    case "lotto.number_freq_bonus": {
      const v = counts(values, 45);
      const b = baselines(baseline, 45);
      return v && b && b.single !== null ? bars(range(1, 45), v, b, "회") : null;
    }
    case "lotto.range_dist": {
      const v = counts(values, 5);
      const b = baselines(baseline, 5);
      return v && b ? bars(LOTTO_RANGES, v, b, "회") : null;
    }
    case "lotto.odd_even": {
      const v = counts(values, 7);
      const b = baselines(baseline, 7);
      return v && b ? bars(range(0, 6).map((k) => `${k}개`), v, b, "회차") : null;
    }
    case "lotto.sum_dist": {
      const v = counts(values, SUM_COUNT);
      const b = baselines(baseline, SUM_COUNT);
      if (!v || !b) return null;
      // 합계 235칸을 10 단위 구간으로 묶어 표시(값·기준선 모두 같은 구간 합 — 표시 전용)
      const labels: string[] = [];
      const binned: number[] = [];
      const binBase: number[] = [];
      for (let start = 0; start < SUM_COUNT; start += SUM_BIN) {
        const end = Math.min(start + SUM_BIN, SUM_COUNT);
        labels.push(`${SUM_MIN + start}~${SUM_MIN + end - 1}`);
        binned.push(v.slice(start, end).reduce((a, c) => a + c, 0));
        binBase.push(b.perBar.slice(start, end).reduce((a, c) => a + c, 0));
      }
      return bars(labels, binned, { single: null, perBar: binBase }, "회차");
    }
    case "lotto.gap": {
      const b = baselines(baseline, 45);
      if (!Array.isArray(values) || values.length !== 45 || !b || b.single === null) return null;
      const entries: BarDatum[] = [];
      for (const [i, raw] of values.entries()) {
        const e = raw as { gap?: unknown; censored?: unknown };
        if (typeof e !== "object" || e === null) return null;
        if (e.censored === true && e.gap === null) {
          // 기간 안 미출현: 간격 ≥ 기간 길이(표본 회차 수) — "N회 이상"
          const n = row.sample_size;
          entries.push({ key: String(i), label: String(i + 1), value: n, short: `${n.toLocaleString("ko-KR")}회 이상`, full: `${n.toLocaleString("ko-KR")}회 이상`, baseline: b.single, censored: true });
        } else if (e.censored === false && isCount(e.gap)) {
          entries.push({ key: String(i), label: String(i + 1), value: e.gap, short: String(e.gap), full: `${e.gap.toLocaleString("ko-KR")}회`, baseline: b.single, censored: false });
        } else {
          return null;
        }
      }
      return { kind: "bars", bars: entries, single: b.single, gap: true };
    }
    case "pension.group_freq": {
      const v = counts(values, 5);
      const b = baselines(baseline, 5);
      return v && b ? bars(range(1, 5).map((g) => `${g}조`), v, b, "회") : null;
    }
    case "pension.digit_freq":
    case "pension.bonus_digit_freq": {
      const single = fractionValue(baseline);
      if (single === null || !Array.isArray(values) || values.length !== 6) return null;
      const rows = values.map((r, i) => ({ key: String(i), label: PENSION_POSITIONS[i]!, cells: counts(r, 10) }));
      if (rows.some((r) => r.cells === null)) return null;
      return { kind: "heat", baseline: single, rows: rows.map((r) => ({ ...r, cells: r.cells! })) };
    }
  }
}
