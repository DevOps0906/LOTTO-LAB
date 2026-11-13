// 화면 공통: 화면이 쓰는 app-core 기능의 구조 타입(ScreenCore)과 읽기 결과 → 화면 상태 변환.
// ui는 app-core 소스를 타입 검사하지 않는다(.ts 확장자 import 설정 차이) — 셸이 AppCore를 넘길 때 셸 typecheck가 호환을 검사한다.
import { useCallback, useEffect, useState } from "react";

export type Game = "lotto" | "pension";

/** app-core ReadResult와 같은 형식(공개 읽기 결과). */
export type ReadResult<T> = {
  data: T | null;
  fetched_at: string | null;
  stale: boolean;
  error?: "NETWORK" | "HTTP" | "INVALID_RESPONSE" | "EMPTY";
};
type ReadOptions = { force?: boolean };
/** 회차 목록 한 페이지(app-core ListDrawsOptions): before = 이 회차 미만(다음 페이지), limit 1~50. */
export type ListDrawsOptions = ReadOptions & { before?: number; limit?: number };

/** prizes 요소(@lotto-lab/types PrizeEntry). amount_won 정수 원 — lump = 1인 당첨금, annuity = 월 지급액 × months. */
export type Prize =
  | { rank: number | null; bonus: boolean; amount_won: number; winners: number; payout: "lump" }
  | { rank: number | null; bonus: boolean; amount_won: number; winners: number; payout: "annuity"; months: number };

export type LottoDraw = {
  draw_no: number;
  draw_date: string;
  nums: number[];
  bonus: number;
  prizes: Prize[];
  source_url: string;
  source_verified_at: string;
};
export type PensionDraw = {
  draw_no: number;
  draw_date: string;
  group_no: number;
  digits: string;
  bonus_digits: string;
  prizes: Prize[];
  source_url: string;
  source_verified_at: string;
};
/** 통계 키(@lotto-lab/types STAT_WINDOWS·STAT_METRICS, task-015 결정 ②). */
export type StatWindow = "last10" | "last20" | "last50" | "last100" | "all";
export type StatMetric =
  | "lotto.number_freq"
  | "lotto.number_freq_bonus"
  | "lotto.range_dist"
  | "lotto.odd_even"
  | "lotto.sum_dist"
  | "lotto.gap"
  | "pension.digit_freq"
  | "pension.group_freq"
  | "pension.bonus_digit_freq";
/** statistics_cache 행 중 화면이 쓰는 부분. payload 형식은 지표마다 다르다(화면이 지표별로 검사해 쓴다). */
export type StatRow = {
  payload: { baseline: unknown; values: unknown[] };
  range_from: number;
  range_to: number;
  sample_size: number;
  source: string;
  updated_at: string;
};
export type Ticket = { game: Game; purchase_status: "favorite" | "purchased"; round: number | null };
export type Generated =
  | { game: "lotto"; created_at: string; numbers: { nums: number[] } }
  | { game: "pension"; created_at: string; numbers: { digits: string } };

/** 화면이 쓰는 app-core(AppCore) 기능. */
export type ScreenCore = {
  reader: {
    latestDraw(game: "lotto", options?: ReadOptions): Promise<ReadResult<LottoDraw>>;
    latestDraw(game: "pension", options?: ReadOptions): Promise<ReadResult<PensionDraw>>;
    statistics(game: Game, window: StatWindow, metric: StatMetric, options?: ReadOptions): Promise<ReadResult<StatRow>>;
    drawByRound(game: "lotto", round: number, options?: ReadOptions): Promise<ReadResult<LottoDraw>>;
    drawByRound(game: "pension", round: number, options?: ReadOptions): Promise<ReadResult<PensionDraw>>;
    listDraws(game: "lotto", options?: ListDrawsOptions): Promise<ReadResult<LottoDraw[]>>;
    listDraws(game: "pension", options?: ListDrawsOptions): Promise<ReadResult<PensionDraw[]>>;
  };
  tickets: { list(): Promise<Ticket[]> };
  generator: {
    generate(request: {
      game: "lotto";
      config: { fixed: number[]; excluded: number[]; games: number };
    }): Promise<{ records: Generated[]; saved: boolean }>;
    history(): Promise<Generated[]>;
  };
  adapters: { openExternal: { open(url: string): Promise<void> } };
};

export const GAME_NAME: Record<Game, string> = { lotto: "로또 6/45", pension: "연금복권 720+" };

/** 읽기 화면 상태 4종(빈·로딩·오류·성공). */
export type ReadView<T> =
  | { kind: "loading" }
  | { kind: "empty"; result: ReadResult<T> }
  | { kind: "error"; result: ReadResult<T> }
  | { kind: "success"; data: T; result: ReadResult<T> };

/** data 없음 + 오류 = 오류, data 없음 + 오류 없음 = 0행(미갱신·미수집), data 있음 = 성공(stale이어도 마지막 정상본 표시). */
export function readView<T>(result: ReadResult<T> | undefined): ReadView<T> {
  if (!result) return { kind: "loading" };
  if (result.data !== null) return { kind: "success", data: result.data, result };
  return result.error ? { kind: "error", result } : { kind: "empty", result };
}

export type Async<T> = { status: "loading" } | { status: "done"; value: T } | { status: "failed"; error: unknown };

/**
 * 비동기 읽기 1건. reload(true)는 TTL을 무시하는 수동 새로고침(force)으로 다시 읽는다.
 * 늦게 온 이전 응답은 버린다(언마운트·재요청).
 */
export function useAsync<T>(load: (force: boolean) => Promise<T>): [Async<T>, (force?: boolean) => void] {
  const [state, setState] = useState<Async<T>>({ status: "loading" });
  const [request, setRequest] = useState({ n: 0, force: false });

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    load(request.force).then(
      (value) => {
        if (alive) setState({ status: "done", value });
      },
      (error: unknown) => {
        if (alive) setState({ status: "failed", error });
      },
    );
    return () => {
      alive = false;
    };
    // load는 화면이 core로 만든 함수 — 요청(request)이 바뀔 때만 다시 읽는다.
  }, [request]);

  const reload = useCallback((force = false) => setRequest((r) => ({ n: r.n + 1, force })), []);
  return [state, reload];
}

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});
const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 추첨일 "YYYY-MM-DD" → "2025. 01. 25. (토)". */
export function formatDrawDate(date: string): string {
  return dateFormatter.format(new Date(`${date}T12:00:00+09:00`));
}

/** ISO 시각 → "01. 25. 21:05"(KST). */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/** 출처 URL의 호스트(표시용). URL이 아니면 그대로. */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const wonFormatter = new Intl.NumberFormat("ko-KR");

/** 정수 원 → "2,000,000,000원"(천 단위 쉼표). */
export function formatWon(won: number): string {
  return `${wonFormatter.format(won)}원`;
}

/** 정수 분수 기준선 → 소수 한 자리 표시(표시 전용, 계산에 쓰지 않는다). */
export function formatFraction(f: { num: number; den: number }): string {
  return (f.num / f.den).toFixed(1);
}
