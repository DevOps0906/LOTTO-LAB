// 화면 테스트용 app-core 목(ScreenCore 구조). 각 메서드는 vi.fn — 테스트가 응답을 바꾼다.
import { vi } from "vitest";
import type { ScreenCore } from "../src";

type Read<T> = { data: T | null; fetched_at: string | null; stale: boolean; error?: "NETWORK" | "HTTP" | "INVALID_RESPONSE" | "EMPTY" };
type Ticket = Awaited<ReturnType<ScreenCore["tickets"]["list"]>>[number];
type Generated = Awaited<ReturnType<ScreenCore["generator"]["history"]>>[number];

export const FETCHED = "2026-11-08T12:10:00.000Z";
export const LOTTO = {
  draw_no: 1132,
  draw_date: "2026-11-07",
  nums: [7, 12, 18, 27, 34, 40],
  bonus: 41,
  prizes: [],
  source_url: "https://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=1132",
  source_verified_at: "2026-11-07T12:05:00.000Z",
};
export const PENSION = {
  draw_no: 290,
  draw_date: "2026-11-06",
  group_no: 3,
  digits: "000719",
  bonus_digits: "123456",
  prizes: [],
  source_url: "https://www.dhlottery.co.kr/pension",
  source_verified_at: "2026-11-06T11:40:00.000Z",
};
const freq = Array.from({ length: 45 }, (_, i) => ([12, 18, 27, 34, 40].includes(i + 1) ? 4 : 1));
export const LOTTO_STAT = {
  game: "lotto",
  window_key: "last10",
  metric: "lotto.number_freq",
  payload: { baseline: { num: 4, den: 3 }, values: freq },
  range_from: 1123,
  range_to: 1132,
  sample_size: 10,
  source: "LOTTO LAB 집계",
  updated_at: "2026-11-07T13:00:00.000Z",
};
export const PENSION_STAT = {
  game: "pension",
  window_key: "last10",
  metric: "pension.group_freq",
  payload: { baseline: { num: 2, den: 1 }, values: [1, 1, 4, 1, 3] },
  range_from: 281,
  range_to: 290,
  sample_size: 10,
  source: "LOTTO LAB 집계",
  updated_at: "2026-11-07T13:00:00.000Z",
};

export function ok<T>(data: T | null): Read<T> {
  return { data, fetched_at: data ? FETCHED : null, stale: false };
}

export function mockCore() {
  const latestDraw = vi.fn(async (game: "lotto" | "pension"): Promise<Read<unknown>> => (game === "lotto" ? ok(LOTTO) : ok(PENSION)));
  const statistics = vi.fn<(game: "lotto" | "pension", window: string, metric: string, options?: object) => Promise<Read<unknown>>>(
    async (game) => (game === "lotto" ? ok(LOTTO_STAT) : ok(PENSION_STAT)),
  );
  const list = vi.fn(async (): Promise<Ticket[]> => []);
  const history = vi.fn(async (): Promise<Generated[]> => []);
  const generate = vi.fn(async () => ({
    records: [{ game: "lotto" as const, created_at: FETCHED, numbers: { nums: [3, 9, 14, 25, 33, 42] } }],
    saved: true,
  }));
  const open = vi.fn<(url: string) => Promise<void>>(async () => {});
  const core = {
    reader: { latestDraw, statistics },
    tickets: { list },
    generator: { generate, history },
    adapters: { openExternal: { open } },
  } as unknown as ScreenCore;
  return { core, latestDraw, statistics, list, history, generate, open };
}
