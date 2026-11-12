// 회차 읽기(A-01·A-02·A-03)·통계 캐시(A-06) 스키마. 읽기 DTO라 모르는 열은 버린다(z.object).
import { z } from "zod";
import { GAME_TYPES, LOTTO_PRIZE_RANK_MAX, PRIZE_RANK_MAX, PRIZE_RANK_MIN, type PrizeEntry } from "@lotto-lab/types";
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

export const StatisticsCacheSchema = z
  .object({
    game: z.enum(GAME_TYPES),
    window_key: z.string(),
    metric: z.string(),
    payload: z.unknown(),
    range_from: int4(),
    range_to: int4(),
    sample_size: int4(0),
    source: z.string(),
    updated_at: isoDateTime,
  })
  .refine((s) => s.range_from <= s.range_to, { message: "range_from은 range_to 이하여야 합니다.", path: ["range_from"] });
