// 회차 읽기(A-01·A-02·A-03)·통계 캐시(A-06) 스키마. 읽기 DTO라 모르는 열은 버린다(z.object).
import { z } from "zod";
import {
  GAME_TYPES,
  LOTTO_PRIZE_RANK_MAX,
  PRIZE_RANK_MAX,
  PRIZE_RANK_MIN,
  STAT_METRICS,
  STAT_WINDOWS,
  type PrizeEntry,
  type StatMetric,
  type StatPayload,
} from "@lotto-lab/types";
import { int4, intRange, isoDate, isoDateTime, lottoNumber, lottoNums, pensionDigits, pensionGroup } from "./primitives.ts";

const prizeBase = {
  rank: intRange(PRIZE_RANK_MIN, PRIZE_RANK_MAX).nullable(),
  bonus: z.boolean(),
  amount_won: z.int().min(0),
  winners: z.int().min(0),
};

/** prizes 요소(연금 기준): 등위 1~7이면 bonus false, rank null이면 bonus true(연금 보너스)만 유효. */
export const PrizeEntrySchema = z
  .discriminatedUnion("payout", [
    z.object({ ...prizeBase, payout: z.literal("lump") }),
    z.object({ ...prizeBase, payout: z.literal("annuity"), months: z.int().min(1) }),
  ])
  .refine((p) => (p.rank === null) === p.bonus, {
    message: "등위가 있으면 보너스가 아니고, 등위가 없으면 보너스여야 합니다.",
    path: ["bonus"],
  });

/** 로또 prizes 요소: 1~5등만, 보너스 표현 없음(2등 = rank 2). */
export const LottoPrizeEntrySchema = PrizeEntrySchema.refine(
  (p) => p.rank !== null && p.rank <= LOTTO_PRIZE_RANK_MAX && !p.bonus,
  { message: "로또 등위는 1~5등이며 보너스 항목이 없습니다.", path: ["rank"] },
);

/** prizes: 요소별로 검증해 잘못된 요소만 빼고 나머지는 유지(전체 실패 금지, 05#1). */
const lenientPrizes = (entry: z.ZodType<PrizeEntry>) =>
  z.array(z.unknown()).transform((items) =>
    items.flatMap((item): PrizeEntry[] => {
      const parsed = entry.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  );
export const PrizesSchema = lenientPrizes(PrizeEntrySchema);
export const LottoPrizesSchema = lenientPrizes(LottoPrizeEntrySchema);

const provenance = {
  source_url: z.url({ protocol: /^https?$/ }),
  source_verified_at: isoDateTime,
};

export const DrawLottoSchema = z
  .object({
    draw_no: int4(1),
    draw_date: isoDate,
    nums: lottoNums,
    bonus: lottoNumber,
    prizes: LottoPrizesSchema,
    ...provenance,
  })
  .refine((d) => !d.nums.includes(d.bonus), { message: "보너스 번호가 당첨 번호와 겹칩니다.", path: ["bonus"] });

export const DrawPensionSchema = z.object({
  draw_no: int4(1),
  draw_date: isoDate,
  group_no: pensionGroup,
  digits: pensionDigits,
  bonus_digits: pensionDigits,
  prizes: PrizesSchema,
  ...provenance,
});

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** 기준선 정수 분수: num ≥ 0, den ≥ 1, 기약분수. */
export const StatFractionSchema = z
  .object({ num: z.int().min(0), den: z.int().min(1) })
  .refine((f) => gcd(f.num, f.den) === 1, { message: "기준선은 기약분수여야 합니다.", path: ["num"] });

const count = z.int().min(0);
const StatGapEntrySchema = z
  .object({ gap: count.nullable(), censored: z.boolean() })
  .refine((e) => e.censored === (e.gap === null), { message: "미출현(censored)이면 gap은 null입니다.", path: ["censored"] });

/** statistics_cache.payload(task-015 결정 ④): 정수 배열·정수 분수만(부동소수 금지). 지표별 형태는 StatisticsCacheSchema가 검사. */
export const StatPayloadSchema = z.object({
  baseline: z.union([StatFractionSchema, z.array(StatFractionSchema)]),
  values: z.union([z.array(count), z.array(z.array(count)), z.array(StatGapEntrySchema)]),
});

type Shape = { values: "counts" | "digits" | "gaps"; length: number; baselineArray: boolean };
/** 지표별 payload 형태(최소 검사): values 종류·길이, 기준선이 배열인지. 인덱스 규칙은 statistics computeStat 주석. */
const STAT_PAYLOAD_SHAPES: Record<StatMetric, Shape> = {
  "lotto.number_freq": { values: "counts", length: 45, baselineArray: false },
  "lotto.number_freq_bonus": { values: "counts", length: 45, baselineArray: false },
  "lotto.range_dist": { values: "counts", length: 5, baselineArray: true },
  "lotto.odd_even": { values: "counts", length: 7, baselineArray: true },
  "lotto.sum_dist": { values: "counts", length: 235, baselineArray: true },
  "lotto.gap": { values: "gaps", length: 45, baselineArray: false },
  "pension.digit_freq": { values: "digits", length: 6, baselineArray: false },
  "pension.group_freq": { values: "counts", length: 5, baselineArray: false },
  "pension.bonus_digit_freq": { values: "digits", length: 6, baselineArray: false },
};

function matchesShape(metric: StatMetric, payload: StatPayload): boolean {
  const shape = STAT_PAYLOAD_SHAPES[metric];
  const v: unknown[] = payload.values;
  if (v.length !== shape.length) return false;
  if (Array.isArray(payload.baseline) !== shape.baselineArray) return false;
  if (Array.isArray(payload.baseline) && payload.baseline.length !== shape.length) return false;
  if (shape.values === "counts") return v.every((x) => typeof x === "number");
  if (shape.values === "gaps") return v.every((x) => typeof x === "object" && x !== null && !Array.isArray(x));
  return v.every((x) => Array.isArray(x) && x.length === 10);
}

export const StatisticsCacheSchema = z
  .object({
    game: z.enum(GAME_TYPES),
    window_key: z.enum(STAT_WINDOWS),
    metric: z.enum(STAT_METRICS),
    payload: StatPayloadSchema,
    range_from: int4(),
    range_to: int4(),
    sample_size: int4(0),
    source: z.string(),
    updated_at: isoDateTime,
  })
  .refine((s) => s.range_from <= s.range_to, { message: "range_from은 range_to 이하여야 합니다.", path: ["range_from"] })
  .refine((s) => s.metric.startsWith(`${s.game}.`), { message: "지표가 게임 종류와 맞지 않습니다.", path: ["metric"] })
  .refine((s) => matchesShape(s.metric, s.payload), { message: "지표와 payload 형태가 맞지 않습니다.", path: ["payload"] });
