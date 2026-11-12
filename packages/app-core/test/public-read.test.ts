// 공개 읽기(DF-4)·판정(DF-5): TTL 캐시·수동 새로고침·오프라인 stale·응답 검증 실패 시 마지막 정상본 유지·purchased만 판정.
import { describe, expect, it } from "vitest";
import {
  AppCoreError,
  DRAW_CACHE_TTL_MS,
  STAT_CACHE_TTL_MS,
  assertAppConfig,
  createAppCore,
  recordKey,
} from "../src/index.ts";
import { CONFIG, DRAW_LOTTO, DRAW_PENSION, MockClock, MockKv, adapters, mockFetch } from "./helpers.ts";

type Responder = Parameters<typeof mockFetch>[0];

function setup(initial: Responder) {
  let respond = initial;
  const kv = new MockKv({ maxDelayMs: 1 });
  const clock = new MockClock();
  const fetch = mockFetch((url) => respond(url));
  const core = createAppCore(adapters(kv, clock, fetch), CONFIG);
  return { kv, clock, fetch, core, setRespond: (r: Responder) => (respond = r) };
}

const STAT = {
  game: "pension",
  window_key: "last10",
  metric: "pension.group_freq",
  payload: { baseline: { num: 1, den: 5 }, values: [2, 2, 2, 2, 2] },
  range_from: 281,
  range_to: 290,
  sample_size: 10,
  source: "draws_pension",
  updated_at: "2026-11-07T13:00:00Z",
};

describe("AppConfig", () => {
  it("https·로컬 http만, publishable 키만", () => {
    expect(() => assertAppConfig(CONFIG)).not.toThrow();
    expect(() => assertAppConfig({ supabaseUrl: "http://127.0.0.1:54321", publishableKey: "k" })).not.toThrow();
    for (const bad of [
      { supabaseUrl: "not a url", publishableKey: "k" },
      { supabaseUrl: "http://project.example.test", publishableKey: "k" },
      { supabaseUrl: "ftp://localhost", publishableKey: "k" },
      { supabaseUrl: CONFIG.supabaseUrl, publishableKey: " " },
      { supabaseUrl: CONFIG.supabaseUrl, publishableKey: "sb_secret_x" },
    ]) {
      expect(() => assertAppConfig(bad)).toThrow(AppCoreError);
    }
  });
});

describe("회차 읽기 — 캐시·TTL·오프라인", () => {
  it("최신 회차: 검증 후 캐시, TTL 안은 네트워크 없음, 지나면 다시 받음, force는 즉시", async () => {
    const { core, fetch, clock } = setup(() => ({ body: [DRAW_LOTTO] }));
    const a = await core.reader.latestDraw("lotto");
    expect(a).toMatchObject({ stale: false, data: { draw_no: 1200, source_url: DRAW_LOTTO.source_url } });
    expect(a.fetched_at).toBe(new Date(clock.time).toISOString());
    expect(fetch.calls).toHaveLength(1);
    const call = fetch.calls[0]!;
    expect(call.url).toBe(
      "https://project.example.test/rest/v1/draws_lotto?select=draw_no,draw_date,nums,bonus,prizes,source_url,source_verified_at&order=draw_no.desc&limit=1",
    );
    expect(call.headers).toStrictEqual({ apikey: CONFIG.publishableKey, Accept: "application/json" });

    clock.advance(DRAW_CACHE_TTL_MS - 1);
    expect((await core.reader.latestDraw("lotto")).fetched_at).toBe(a.fetched_at);
    expect(fetch.calls).toHaveLength(1);
    await core.reader.latestDraw("lotto", { force: true });
    expect(fetch.calls).toHaveLength(2);
    clock.advance(DRAW_CACHE_TTL_MS);
    await core.reader.latestDraw("lotto");
    expect(fetch.calls).toHaveLength(3);
  });

  it("오프라인: 마지막 정상본 + stale + 마지막 동기화 시각", async () => {
    const { core, clock, setRespond } = setup(() => ({ body: [DRAW_LOTTO] }));
    const ok = await core.reader.latestDraw("lotto");
    setRespond(() => new Error("offline"));
    clock.advance(DRAW_CACHE_TTL_MS + 1);
    const off = await core.reader.latestDraw("lotto");
    expect(off).toStrictEqual({ data: ok.data, fetched_at: ok.fetched_at, stale: true, error: "NETWORK" });
  });

  it("캐시도 없는 실패: data null + error", async () => {
    const { core } = setup(() => new Error("offline"));
    expect(await core.reader.latestDraw("pension")).toStrictEqual({ data: null, fetched_at: null, stale: true, error: "NETWORK" });
  });

  it("HTTP 오류·응답 검증 실패는 정상본을 덮어쓰지 않는다", async () => {
    const { core, kv, clock, setRespond } = setup(() => ({ body: [DRAW_LOTTO] }));
    await core.reader.latestDraw("lotto");
    const key = recordKey("cache", "draw:lotto:latest");
    const cached = kv.data.get(key);
    for (const [respond, error] of [
      [() => ({ status: 503, body: {} }), "HTTP"],
      [() => ({ body: [{ ...DRAW_LOTTO, nums: [1, 2, 3, 4, 5, 46] }] }), "INVALID_RESPONSE"],
      [() => ({ body: [{ ...DRAW_LOTTO, bonus: 1 }] }), "INVALID_RESPONSE"],
      [() => ({ body: { not: "array" } }), "INVALID_RESPONSE"],
      [() => ({ body: [DRAW_LOTTO, DRAW_LOTTO] }), "INVALID_RESPONSE"],
    ] as const) {
      setRespond(respond);
      clock.advance(DRAW_CACHE_TTL_MS + 1);
      const r = await core.reader.latestDraw("lotto");
      expect(r).toMatchObject({ stale: true, error, data: { draw_no: 1200 } });
      expect(kv.data.get(key)).toBe(cached);
    }
  });

  it("0행 = 미갱신(data null, stale 아님)도 캐시", async () => {
    const { core, fetch } = setup(() => ({ body: [] }));
    expect(await core.reader.latestDraw("lotto")).toMatchObject({ data: null, stale: false });
    expect(await core.reader.latestDraw("lotto")).toMatchObject({ data: null, stale: false });
    expect(fetch.calls).toHaveLength(1);
  });

  it("prizes는 관대: 잘못된 요소만 빠진다. 연금 번호는 문자열 보존", async () => {
    const { core } = setup((url) =>
      url.includes("draws_pension")
        ? { body: [{ ...DRAW_PENSION, prizes: [...DRAW_PENSION.prizes, { rank: 9, junk: true }] }] }
        : { body: [] },
    );
    const r = await core.reader.latestDraw("pension");
    expect(r.data?.digits).toBe("000719");
    expect(r.data?.prizes).toHaveLength(1);
  });

  it("회차별: URL에 draw_no, 잘못된 회차는 INVALID_INPUT", async () => {
    const { core, fetch } = setup(() => ({ body: [DRAW_PENSION] }));
    expect((await core.reader.drawByRound("pension", 290)).data?.draw_no).toBe(290);
    expect(fetch.calls[0]!.url).toContain("/rest/v1/draws_pension?select=");
    expect(fetch.calls[0]!.url).toContain("&draw_no=eq.290&limit=1");
    await expect(core.reader.drawByRound("lotto", 0)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(core.reader.drawByRound("lotto", 1.5)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("깨진 캐시는 없는 것으로 보고, 캐시 쓰기 실패는 결과를 막지 않는다", async () => {
    const { core, kv, fetch } = setup(() => ({ body: [DRAW_LOTTO] }));
    const key = recordKey("cache", "draw:lotto:latest");
    kv.data.set(key, JSON.stringify({ v: 1, fetched_at: "bad", data: {} }));
    expect((await core.reader.latestDraw("lotto")).stale).toBe(false);
    kv.data.set(key, JSON.stringify({ v: 1, fetched_at: new Date().toISOString(), data: { draw_no: "x" } }));
    kv.fail = (op) => op === "set";
    const r = await core.reader.latestDraw("lotto");
    expect(r).toMatchObject({ stale: false, data: { draw_no: 1200 } });
    expect(fetch.calls).toHaveLength(2);
  });
});

describe("통계 읽기(A-06)", () => {
  it("쿼리·검증·TTL 60분", async () => {
    const { core, fetch, clock } = setup(() => ({ body: [STAT] }));
    const r = await core.reader.statistics("pension", "last10", "pension.group_freq");
    expect(r.data).toMatchObject({ sample_size: 10, source: "draws_pension", range_from: 281 });
    expect(fetch.calls[0]!.url).toContain("/rest/v1/statistics_cache?select=");
    expect(fetch.calls[0]!.url).toContain("&game=eq.pension&window_key=eq.last10&metric=eq.pension.group_freq&limit=1");
    clock.advance(STAT_CACHE_TTL_MS - 1);
    await core.reader.statistics("pension", "last10", "pension.group_freq");
    expect(fetch.calls).toHaveLength(1);
  });

  it("payload 형태 불일치는 INVALID_RESPONSE", async () => {
    const { core } = setup(() => ({ body: [{ ...STAT, payload: { baseline: { num: 1, den: 5 }, values: [0.5] } }] }));
    expect(await core.reader.statistics("pension", "last10", "pension.group_freq")).toMatchObject({ error: "INVALID_RESPONSE", data: null });
  });
});

describe("당첨 판정(DF-5) — purchased만, 저장하지 않음", () => {
  it("purchased × 캐시 회차 → judge, favorite·생성 이력은 대상 아님, 결과에 출처·시각", async () => {
    const { core, kv } = setup((url) => {
      if (url.includes("draws_lotto") && url.includes("draw_no=eq.1200")) return { body: [DRAW_LOTTO] };
      if (url.includes("draws_pension") && url.includes("draw_no=eq.290")) return { body: [DRAW_PENSION] };
      return { body: [] };
    });
    await core.generator.generate({ game: "lotto", config: { fixed: [1, 2, 3, 4, 5, 6], excluded: [], games: 1 } });
    const purchased = { purchase_status: "purchased", purchase_date: "2026-11-05" } as const;
    const win = await core.tickets.save({ game: "lotto", ticket_data: { nums: [1, 2, 3, 4, 5, 7] }, round: 1200, ...purchased });
    await core.tickets.save({ game: "lotto", ticket_data: { nums: [1, 2, 3, 4, 5, 6] }, round: 1200, purchase_status: "favorite" });
    const noRound = await core.tickets.save({ game: "lotto", ticket_data: { nums: [1, 2, 3, 4, 5, 6] }, round: null, ...purchased });
    const future = await core.tickets.save({ game: "lotto", ticket_data: { nums: [1, 2, 3, 4, 5, 6] }, round: 1201, ...purchased });
    const pension = await core.tickets.save({ game: "pension", ticket_data: { group_no: 1, digits: "000719" }, round: 290, ...purchased });
    const keysBefore = kv.keysOf(recordKey("ticket", "")).length + kv.keysOf(recordKey("generated", "")).length;

    const out = await core.checker.checkPurchased();
    expect(out).toHaveLength(4);
    const by = (id: string) => out.find((o) => o.ticket.id === id)!;
    expect(by(win.id)).toMatchObject({
      status: "checked",
      draw_no: 1200,
      result: { matched_rank: 2, bonus_hit: false },
      source_url: DRAW_LOTTO.source_url,
      source_verified_at: DRAW_LOTTO.source_verified_at,
      stale: false,
    });
    expect(by(pension.id)).toMatchObject({ status: "checked", result: { matched_rank: 2, bonus_hit: false } });
    expect(by(noRound.id)).toMatchObject({ status: "no_round" });
    expect(by(future.id)).toMatchObject({ status: "pending", stale: false });
    expect(out.every((o) => o.ticket.purchase_status === "purchased")).toBe(true);
    expect(kv.keysOf(recordKey("ticket", "")).length + kv.keysOf(recordKey("generated", "")).length).toBe(keysBefore);
    expect((await core.checker.checkPurchased("pension")).map((o) => o.ticket.id)).toStrictEqual([pension.id]);
  });

  it("오프라인이고 캐시 없으면 pending + error", async () => {
    const { core } = setup(() => new Error("offline"));
    await core.tickets.save({
      game: "lotto",
      ticket_data: { nums: [1, 2, 3, 4, 5, 6] },
      round: 1200,
      purchase_status: "purchased",
      purchase_date: "2026-11-05",
    });
    expect(await core.checker.checkPurchased()).toMatchObject([{ status: "pending", stale: true, error: "NETWORK" }]);
  });
});
