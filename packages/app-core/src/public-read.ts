// 공개 읽기(DF-4, A-01·A-02·A-03·A-06) — fetch로 PostgREST 직접 호출(결정 ⑥, supabase-js 없음). anon(publishable) 키만.
// 응답은 Zod로 검증(prizes는 요소 단위 관대 파싱). 마지막 정상본을 fetched_at과 함께 기기 캐시에 두고(결정 ⑦),
// TTL 안이면 캐시, 네트워크·HTTP·검증 실패면 마지막 정상본을 stale로 돌려준다(오프라인 표기, R6).
import type { DrawLotto, DrawPension, GameType, StatMetric, StatWindow, StatisticsCache } from "@lotto-lab/types";
import { DrawLottoSchema, DrawPensionSchema, StatisticsCacheSchema, isoDateTime } from "@lotto-lab/validation";
import type { AppConfig, Clock, HttpFetch } from "./adapters.ts";
import { AppCoreError } from "./errors.ts";
import { CACHE_VERSION, type LocalStore, type Parser } from "./storage.ts";

/** 초기 TTL(결정 ⑦). R22 수치 확정은 출시 점검(task-036)에서 측정 후 04#4에 기록. */
export const DRAW_CACHE_TTL_MS = 10 * 60 * 1000;
export const STAT_CACHE_TTL_MS = 60 * 60 * 1000;
/** 회차 목록 한 페이지 기본·최대 행 수. */
export const DRAW_PAGE_DEFAULT = 20;
export const DRAW_PAGE_MAX = 50;

/** EMPTY: 최신 회차가 0행으로 왔지만 이전 정상본이 있어 그것을 유지함(stale). */
export type ReadError = "NETWORK" | "HTTP" | "INVALID_RESPONSE" | "EMPTY";

/**
 * 화면 전달용 결과. data null = 0행(미갱신·미수집) 또는 캐시도 없는 실패(error 있음).
 * 회차 출처·검증 시각은 data(source_url·source_verified_at), 통계는 data(source·updated_at)에 있다.
 */
export type ReadResult<T> = {
  data: T | null;
  /** 이 데이터를 서버에서 받은 시각(마지막 동기화). 받은 적 없으면 null. */
  fetched_at: string | null;
  /** 이번 요청이 실패해 마지막 정상본(또는 없음)을 돌려줌. */
  stale: boolean;
  error?: ReadError;
};

/** origin: 받은 서버(URL.origin). 설정이 바뀌면(로컬→운영 등) 다른 서버의 캐시는 쓰지 않는다. */
type CacheEnvelope = { v: typeof CACHE_VERSION; origin: string; fetched_at: string; data: unknown };

type ReadSpec<T> = {
  /** null이면 캐시를 쓰지 않는다(목록의 다음 페이지 등). */
  cacheId: string | null;
  path: string;
  parser: Parser<T>;
  ttlMs: number;
  /** 응답 행이 요청 키와 같은지(다르면 INVALID_RESPONSE, 캐시 저장 안 함). */
  matches?: (data: T) => boolean;
  /** 0행이면 이전 정상본을 유지(최신 회차용). */
  keepOnEmpty?: boolean;
  /** 응답 배열 전체를 parser에 넘긴다(목록). 0행도 빈 배열 data. */
  list?: boolean;
};

const DRAW_COLUMNS = {
  lotto: "draw_no,draw_date,nums,bonus,prizes,source_url,source_verified_at",
  pension: "draw_no,draw_date,group_no,digits,bonus_digits,prizes,source_url,source_verified_at",
} as const;
const STAT_COLUMNS = "game,window_key,metric,payload,range_from,range_to,sample_size,source,updated_at";

/**
 * publishable 키·https URL만 받는다(로컬 개발은 http://localhost·127.0.0.1 허용).
 * URL에 경로·쿼리·해시·사용자 정보가 있으면 거부. 서버 키(sb_secret_)와 role이 anon이 아닌 레거시 JWT(service_role 등)는 거부.
 */
export function assertAppConfig(config: AppConfig): void {
  let url: URL;
  try {
    url = new URL(config.supabaseUrl);
  } catch {
    throw new AppCoreError("INVALID_CONFIG", "supabaseUrl");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new AppCoreError("INVALID_CONFIG", "supabaseUrl");
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "" || url.username !== "" || url.password !== "") {
    throw new AppCoreError("INVALID_CONFIG", "supabaseUrl");
  }
  const key = config.publishableKey;
  if (typeof key !== "string" || key.trim() === "") throw new AppCoreError("INVALID_CONFIG", "publishableKey");
  if (key.startsWith("sb_secret_")) throw new AppCoreError("INVALID_CONFIG", "publishableKey");
  if (key.startsWith("eyJ") && jwtRole(key) !== "anon") throw new AppCoreError("INVALID_CONFIG", "publishableKey");
}

/** 레거시 JWT 키의 payload.role(서명 검증 없음 — 잘못 넣은 서버 키를 막는 용도). 읽을 수 없으면 null. */
function jwtRole(token: string): string | null {
  const part = token.split(".")[1];
  if (part === undefined || !/^[A-Za-z0-9_-]+$/.test(part)) return null;
  try {
    const payload: unknown = JSON.parse(base64UrlToText(part));
    const role = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>).role : undefined;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url → UTF-8 문자열(전역 atob·TextDecoder에 기대지 않는다). 잘못된 UTF-8이면 URIError. */
function base64UrlToText(input: string): string {
  let bits = 0;
  let acc = 0;
  let hex = "";
  for (const ch of input) {
    acc = ((acc << 6) | B64.indexOf(ch)) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      hex += "%" + ((acc >> bits) & 0xff).toString(16).padStart(2, "0");
    }
  }
  return decodeURIComponent(hex);
}

export class PublicReader {
  private readonly base: string;
  private readonly config: AppConfig;
  private readonly fetch: HttpFetch;
  private readonly clock: Clock;
  private readonly store: LocalStore;

  constructor(config: AppConfig, fetch: HttpFetch, clock: Clock, store: LocalStore) {
    assertAppConfig(config);
    this.config = config;
    this.fetch = fetch;
    this.clock = clock;
    this.store = store;
    this.base = new URL(config.supabaseUrl).origin;
  }

  /** A-01·A-02 최신 회차. */
  latestDraw(game: "lotto", options?: ReadOptions): Promise<ReadResult<DrawLotto>>;
  latestDraw(game: "pension", options?: ReadOptions): Promise<ReadResult<DrawPension>>;
  latestDraw(game: GameType, options?: ReadOptions): Promise<ReadResult<DrawLotto | DrawPension>>;
  latestDraw(game: GameType, options: ReadOptions = {}): Promise<ReadResult<DrawLotto | DrawPension>> {
    const query = `select=${DRAW_COLUMNS[game]}&order=draw_no.desc&limit=1`;
    return this.read(
      { cacheId: `draw:${game}:latest`, path: `draws_${game}?${query}`, parser: drawParser(game), ttlMs: DRAW_CACHE_TTL_MS, keepOnEmpty: true },
      options,
    );
  }

  /** A-03 회차별. round는 정수 ≥1(클라이언트 검증). */
  drawByRound(game: "lotto", round: number, options?: ReadOptions): Promise<ReadResult<DrawLotto>>;
  drawByRound(game: "pension", round: number, options?: ReadOptions): Promise<ReadResult<DrawPension>>;
  drawByRound(game: GameType, round: number, options?: ReadOptions): Promise<ReadResult<DrawLotto | DrawPension>>;
  drawByRound(game: GameType, round: number, options: ReadOptions = {}): Promise<ReadResult<DrawLotto | DrawPension>> {
    if (!Number.isSafeInteger(round) || round < 1) return Promise.reject(new AppCoreError("INVALID_INPUT", "round"));
    const query = `select=${DRAW_COLUMNS[game]}&draw_no=eq.${round}&limit=1`;
    return this.read(
      {
        cacheId: `draw:${game}:${round}`,
        path: `draws_${game}?${query}`,
        parser: drawParser(game),
        ttlMs: DRAW_CACHE_TTL_MS,
        matches: (d) => d.draw_no === round,
      },
      options,
    );
  }

  /** A-06 통계 1건(game·window·metric). */
  statistics(game: GameType, window: StatWindow, metric: StatMetric, options: ReadOptions = {}): Promise<ReadResult<StatisticsCache>> {
    const query =
      `select=${STAT_COLUMNS}&game=eq.${encodeURIComponent(game)}` +
      `&window_key=eq.${encodeURIComponent(window)}&metric=eq.${encodeURIComponent(metric)}&limit=1`;
    return this.read(
      {
        cacheId: `stat:${game}:${window}:${metric}`,
        path: `statistics_cache?${query}`,
        parser: StatisticsCacheSchema,
        ttlMs: STAT_CACHE_TTL_MS,
        matches: (d) => d.game === game && d.window_key === window && d.metric === metric,
      },
      options,
    );
  }

  /**
   * 회차 목록(A-01·A-02와 같은 열) — draw_no 내림차순 한 페이지. before가 있으면 그 회차 미만(키셋 페이지).
   * 캐시는 최신 페이지(before 없음)만. 0행은 data [] (미수집).
   */
  listDraws(game: "lotto", options?: ListDrawsOptions): Promise<ReadResult<DrawLotto[]>>;
  listDraws(game: "pension", options?: ListDrawsOptions): Promise<ReadResult<DrawPension[]>>;
  listDraws(game: GameType, options?: ListDrawsOptions): Promise<ReadResult<(DrawLotto | DrawPension)[]>>;
  listDraws(game: GameType, options: ListDrawsOptions = {}): Promise<ReadResult<(DrawLotto | DrawPension)[]>> {
    const { before, limit = DRAW_PAGE_DEFAULT, force } = options;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > DRAW_PAGE_MAX) {
      return Promise.reject(new AppCoreError("INVALID_INPUT", "limit"));
    }
    if (before !== undefined && (!Number.isSafeInteger(before) || before < 1)) {
      return Promise.reject(new AppCoreError("INVALID_INPUT", "before"));
    }
    const query =
      `select=${DRAW_COLUMNS[game]}` + (before === undefined ? "" : `&draw_no=lt.${before}`) + `&order=draw_no.desc&limit=${limit}`;
    return this.read(
      {
        cacheId: before === undefined ? `draws:${game}:page:${limit}` : null,
        path: `draws_${game}?${query}`,
        parser: drawListParser(drawParser(game), limit, before),
        ttlMs: DRAW_CACHE_TTL_MS,
        list: true,
      },
      { force },
    );
  }

  private async read<T>(spec: ReadSpec<T>, options: ReadOptions): Promise<ReadResult<T>> {
    const { cacheId, parser, ttlMs } = spec;
    const cached = cacheId === null ? null : await this.store.run(() => this.loadCache(cacheId, parser));
    const now = this.clock.now();
    if (cached && !options.force) {
      const age = now.getTime() - Date.parse(cached.fetched_at);
      if (age >= 0 && age < ttlMs) return { data: cached.data, fetched_at: cached.fetched_at, stale: false };
    }

    let fetched = await this.request(spec.path, parser, spec.list ?? false);
    if ("data" in fetched && fetched.data !== null && spec.matches && !spec.matches(fetched.data)) {
      fetched = { error: "INVALID_RESPONSE" };
    }
    if ("data" in fetched && fetched.data === null && spec.keepOnEmpty && cached?.data != null) fetched = { error: "EMPTY" };
    if ("error" in fetched) {
      return { data: cached?.data ?? null, fetched_at: cached?.fetched_at ?? null, stale: true, error: fetched.error };
    }
    const fetchedAt = now.toISOString();
    const envelope: CacheEnvelope = { v: CACHE_VERSION, origin: this.base, fetched_at: fetchedAt, data: fetched.data };
    // 캐시 쓰기 실패는 화면 표시를 막지 않는다 — 다음 요청이 다시 받는다.
    if (cacheId !== null) await this.store.run(() => this.store.put("cache", cacheId, envelope)).catch(() => undefined);
    return { data: fetched.data, fetched_at: fetchedAt, stale: false };
  }

  private async request<T>(path: string, parser: Parser<T>, list: boolean): Promise<{ data: T | null } | { error: ReadError }> {
    let body: unknown;
    try {
      // 메서드로 부르면 this가 바뀌어 브라우저 전역 fetch가 Illegal invocation을 던진다 — 분리해 호출한다.
      const fetchFn = this.fetch;
      const res = await fetchFn(`${this.base}/rest/v1/${path}`, {
        method: "GET",
        // publishable 키는 JWT가 아니므로 Authorization 없이 apikey 헤더만 보낸다(anon 역할).
        headers: { apikey: this.config.publishableKey, Accept: "application/json" },
      });
      if (!res.ok) return { error: "HTTP" };
      body = await res.json();
    } catch {
      return { error: "NETWORK" };
    }
    if (!Array.isArray(body)) return { error: "INVALID_RESPONSE" };
    if (list) {
      const all = parser.safeParse(body);
      return all.success ? { data: all.data } : { error: "INVALID_RESPONSE" };
    }
    if (body.length > 1) return { error: "INVALID_RESPONSE" };
    if (body.length === 0) return { data: null };
    const parsed = parser.safeParse(body[0]);
    return parsed.success ? { data: parsed.data } : { error: "INVALID_RESPONSE" };
  }

  private async loadCache<T>(cacheId: string, parser: Parser<T>): Promise<{ fetched_at: string; data: T | null } | null> {
    const envelope = await this.store.get("cache", cacheId, envelopeParser);
    if (!envelope || envelope.origin !== this.base) return null;
    if (envelope.data === null) return { fetched_at: envelope.fetched_at, data: null };
    const parsed = parser.safeParse(envelope.data);
    return parsed.success ? { fetched_at: envelope.fetched_at, data: parsed.data } : null;
  }
}

export type ReadOptions = {
  /** 수동 새로고침: TTL을 무시하고 네트워크를 먼저 시도한다. */
  force?: boolean;
};

export type ListDrawsOptions = ReadOptions & {
  /** 이 회차 미만만(다음 페이지). 정수 ≥1 */
  before?: number;
  /** 1~DRAW_PAGE_MAX, 기본 DRAW_PAGE_DEFAULT */
  limit?: number;
};

function drawParser(game: GameType): Parser<DrawLotto | DrawPension> {
  return game === "lotto" ? DrawLottoSchema : DrawPensionSchema;
}

/** 목록 응답: 행마다 검증, limit 이하·draw_no 엄격 내림차순·before 미만이 아니면 전체 실패(요청과 다른 응답). */
function drawListParser<T extends { draw_no: number }>(row: Parser<T>, limit: number, before: number | undefined): Parser<T[]> {
  return {
    safeParse(input: unknown) {
      if (!Array.isArray(input) || input.length > limit) return { success: false };
      const rows: T[] = [];
      for (const item of input) {
        const parsed = row.safeParse(item);
        if (!parsed.success) return { success: false };
        const prev = rows[rows.length - 1];
        if ((prev && parsed.data.draw_no >= prev.draw_no) || (before !== undefined && parsed.data.draw_no >= before)) {
          return { success: false };
        }
        rows.push(parsed.data);
      }
      return { success: true, data: rows };
    },
  };
}

const envelopeParser: Parser<CacheEnvelope> = {
  safeParse(input: unknown) {
    if (typeof input !== "object" || input === null) return { success: false };
    const e = input as Record<string, unknown>;
    if (e.v !== CACHE_VERSION || typeof e.origin !== "string" || !("data" in e)) return { success: false };
    if (!isoDateTime.safeParse(e.fetched_at).success) return { success: false };
    return { success: true, data: { v: CACHE_VERSION, origin: e.origin, fetched_at: e.fetched_at as string, data: e.data } };
  },
};
