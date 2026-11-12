import type { GameType } from "./constants.ts";

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

/** statistics_cache 행(A-06). 기준선·표본·기간 표기에 range_*·sample_size·source·updated_at을 쓴다. */
export type StatisticsCache = {
  game: GameType;
  window_key: string;
  metric: string;
  payload: unknown;
  range_from: number;
  range_to: number;
  sample_size: number;
  source: string;
  updated_at: string;
};
