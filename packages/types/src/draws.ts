import type { GameType, StatMetric, StatWindow } from "./constants.ts";

// 회차 읽기 DTO(A-01·A-02·A-03). 날짜는 `YYYY-MM-DD` 문자열, 시각은 오프셋 포함 ISO 문자열.

/**
 * prizes jsonb 요소(05#1). rank 1~7, 연금 보너스는 rank null + bonus true(draw_checks와 같은 표현).
 * amount_won 정수 원 — lump = 1인 당첨금, annuity = 월 지급액(months 필수).
 */
export type PrizeEntry =
  | { rank: number | null; bonus: boolean; amount_won: number; winners: number; payout: "lump" }
  | { rank: number | null; bonus: boolean; amount_won: number; winners: number; payout: "annuity"; months: number };

export type DrawLotto = {
  draw_no: number;
  draw_date: string;
  nums: number[];
  bonus: number;
  prizes: PrizeEntry[];
  source_url: string;
  source_verified_at: string;
};

export type DrawPension = {
  draw_no: number;
  draw_date: string;
  group_no: number;
  digits: string;
  bonus_digits: string;
  prizes: PrizeEntry[];
  source_url: string;
  source_verified_at: string;
};

/** 통계 기준선 정수 분수(기약분수, den > 0) — payload에 부동소수 금지(task-015 결정 ④). */
export type StatFraction = { num: number; den: number };
/** 미출현 간격(draw_no 차이). 기간 안 미출현이면 gap null + censored true. */
export type StatGapEntry = { gap: number | null; censored: boolean };
/** statistics_cache.payload 정본 형식. 지표별 인덱스 규칙은 @lotto-lab/statistics computeStat 주석. */
export type StatPayload = {
  baseline: StatFraction | StatFraction[];
  values: number[] | number[][] | StatGapEntry[];
};

/** statistics_cache 행(A-06). 기준선·표본·기간 표기에 range_*·sample_size·source·updated_at을 쓴다. */
export type StatisticsCache = {
  game: GameType;
  window_key: StatWindow;
  metric: StatMetric;
  payload: StatPayload;
  range_from: number;
  range_to: number;
  sample_size: number;
  source: string;
  updated_at: string;
};
