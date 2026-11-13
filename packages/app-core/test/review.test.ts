// task-016 리뷰 반영: 키 검사(JWT role)·URL 형태·캐시 origin·응답 키 대조·최신 0행 유지·정리 실패 구분·
// 마이그레이션 v 증가 검사·캐시 버전·판정 회차 dedupe·회차 제안·멱등 키 발급.
import { describe, expect, it } from "vitest";
import { LocalTicketSchema } from "@lotto-lab/validation";
import {
  AppCoreError,
  CACHE_VERSION,
  DRAW_CACHE_TTL_MS,
  GENERATED_HISTORY_LIMIT,
  LocalStore,
  assertAppConfig,
  createAppCore,
  newIdempotencyKey,
  recordKey,
} from "../src/index.ts";
import { CONFIG, DRAW_LOTTO, MockClock, MockKv, adapters, mockFetch } from "./helpers.ts";

type Responder = Parameters<typeof mockFetch>[0];

function setup(initial: Responder, kv = new MockKv({ maxDelayMs: 0 }), config = CONFIG) {
  let respond = initial;
  const clock = new MockClock();
  const fetch = mockFetch((url) => respond(url));
  const core = createAppCore(adapters(kv, clock, fetch), config);
  return { kv, clock, fetch, core, setRespond: (r: Responder) => (respond = r) };
}

const HEADER = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
const ANON = "eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIn0";
const SERVICE = "eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("보안 — AppConfig", () => {
  const url = CONFIG.supabaseUrl;
  it("레거시 JWT 키는 role이 anon일 때만 허용", () => {
    expect(() => assertAppConfig({ supabaseUrl: url, publishableKey: `${HEADER}.${ANON}.sig` })).not.toThrow();
    for (const key of [`${HEADER}.${SERVICE}.sig`, `${HEADER}.!!!.sig`, `${HEADER}`, `${HEADER}.eyJyb2xlIjoxfQ.sig`, `${HEADER}.gA.sig`]) {
      expect(() => assertAppConfig({ supabaseUrl: url, publishableKey: key })).toThrow(AppCoreError);
    }
  });

  it("URL에 경로·쿼리·해시·사용자 정보가 있으면 거부", () => {
    for (const bad of [
      "https://project.example.test/rest/v1",
      "https://project.example.test/?x=1",
      "https://project.example.test/#a",
      "https://user:pw@project.example.test",
    ]) {
      expect(() => assertAppConfig({ supabaseUrl: bad, publishableKey: "k" })).toThrow(AppCoreError);
    }
  });
});

describe("보안 — 캐시 origin·응답 키 대조", () => {
  it("다른 서버(로컬→운영)의 캐시는 쓰지 않는다", async () => {
    const kv = new MockKv({ maxDelayMs: 0 });
    const local = setup(() => ({ body: [DRAW_LOTTO] }), kv, { supabaseUrl: "http://127.0.0.1:54321", publishableKey: "k" });
    await local.core.reader.latestDraw("lotto");
    const prod = setup(() => new Error("offline"), kv);
    expect(await prod.core.reader.latestDraw("lotto")).toStrictEqual({ data: null, fetched_at: null, stale: true, error: "NETWORK" });
    expect(JSON.parse(kv.data.get(recordKey("cache", "draw:lotto:latest"))!).origin).toBe("http://127.0.0.1:54321");
  });

  it("drawByRound 응답 draw_no가 요청과 다르면 INVALID_RESPONSE, 캐시 안 함", async () => {
    const { core, kv } = setup(() => ({ body: [DRAW_LOTTO] }));
    expect(await core.reader.drawByRound("lotto", 1199)).toMatchObject({ data: null, stale: true, error: "INVALID_RESPONSE" });
    expect(kv.data.has(recordKey("cache", "draw:lotto:1199"))).toBe(false);
  });

  it("statistics 응답 game·window·metric이 요청과 다르면 INVALID_RESPONSE", async () => {
    const stat = {
      game: "pension",
      window_key: "last20",
      metric: "pension.group_freq",
      payload: { baseline: { num: 1, den: 5 }, values: [2, 2, 2, 2, 2] },
      range_from: 271,
      range_to: 290,
      sample_size: 20,
      source: "draws_pension",
      updated_at: "2026-11-07T13:00:00Z",
    };
    const { core, kv } = setup(() => ({ body: [stat] }));
    expect(await core.reader.statistics("pension", "last10", "pension.group_freq")).toMatchObject({ error: "INVALID_RESPONSE" });
    expect(kv.keysOf(recordKey("cache", ""))).toHaveLength(0);
    expect((await core.reader.statistics("pension", "last20", "pension.group_freq")).data?.sample_size).toBe(20);
  });
});

describe("캐시 봉투", () => {
  it("최신 회차가 0행으로 오면 이전 정상본 유지(stale·EMPTY), 캐시 그대로", async () => {
    const { core, kv, clock, setRespond } = setup(() => ({ body: [DRAW_LOTTO] }));
    const ok = await core.reader.latestDraw("lotto");
    const raw = kv.data.get(recordKey("cache", "draw:lotto:latest"));
    setRespond(() => ({ body: [] }));
    clock.advance(DRAW_CACHE_TTL_MS + 1);
    expect(await core.reader.latestDraw("lotto")).toStrictEqual({ data: ok.data, fetched_at: ok.fetched_at, stale: true, error: "EMPTY" });
    expect(kv.data.get(recordKey("cache", "draw:lotto:latest"))).toBe(raw);
  });

  it("캐시 버전은 CACHE_VERSION — 미래 버전 봉투는 무시하고 덮어쓴다(파생 데이터)", async () => {
    const { core, kv, fetch } = setup(() => ({ body: [DRAW_LOTTO] }));
    const key = recordKey("cache", "draw:lotto:latest");
    kv.data.set(key, JSON.stringify({ v: CACHE_VERSION + 1, origin: "https://project.example.test", fetched_at: new Date().toISOString(), data: null }));
    expect((await core.reader.latestDraw("lotto")).data?.draw_no).toBe(1200);
    expect(fetch.calls).toHaveLength(1);
    expect(JSON.parse(kv.data.get(key)!).v).toBe(CACHE_VERSION);
  });
});

describe("생성 — 쓰기 실패와 정리 실패 구분", () => {
  it("저장 성공·정리 실패면 saved true + pruneFailed true", async () => {
    const { core, kv, clock } = setup(() => new Error("offline"));
    for (let i = 0; i < 4; i++) {
      clock.advance(1000);
      expect(await core.generator.generate({ game: "lotto", config: { fixed: [], excluded: [], games: 50 } })).toMatchObject({
        saved: true,
        pruneFailed: false,
      });
    }
    kv.fail = (op) => op === "delete";
    clock.advance(1000);
    const r = await core.generator.generate({ game: "lotto", config: { fixed: [], excluded: [], games: 10 } });
    expect(r).toMatchObject({ saved: true, pruneFailed: true });
    kv.fail = () => false;
    clock.advance(1000);
    expect(await core.generator.generate({ game: "lotto", config: { fixed: [], excluded: [], games: 1 } })).toMatchObject({ pruneFailed: false });
    expect(await core.generator.history()).toHaveLength(GENERATED_HISTORY_LIMIT);
  });
});

describe("마이그레이션 — 단계가 v를 올리지 않으면 중단", () => {
  it("같은 v를 돌려주는 단계는 건너뛰고 원본 보존(무한 루프 없음)", async () => {
    const kv = new MockKv({ maxDelayMs: 0 });
    const key = recordKey("ticket", "x");
    const raw = JSON.stringify({ v: 0, id: "x" });
    kv.data.set(key, raw);
    let calls = 0;
    const store = new LocalStore(kv, {
      ticket: {
        0: (r) => {
          calls++;
          return { ...r };
        },
      },
    });
    expect(await store.run(() => store.scan("ticket", LocalTicketSchema))).toHaveLength(0);
    expect(calls).toBe(1);
    expect(kv.data.get(key)).toBe(raw);
  });
});

describe("판정 — 회차별 요청 1회", () => {
  it("force여도 같은 회차는 한 번만 요청", async () => {
    const { core, fetch } = setup((url) => (url.includes("draw_no=eq.1200") ? { body: [DRAW_LOTTO] } : { body: [] }));
    const base = { game: "lotto", round: 1200, purchase_status: "purchased", purchase_date: "2026-11-05" } as const;
    await core.tickets.save({ ...base, ticket_data: { nums: [1, 2, 3, 4, 5, 6] } });
    await core.tickets.save({ ...base, ticket_data: { nums: [7, 8, 9, 10, 11, 12] } });
    await core.tickets.save({ ...base, round: 1201, ticket_data: { nums: [7, 8, 9, 10, 11, 12] } });
    const out = await core.checker.checkPurchased(undefined, { force: true });
    expect(out).toHaveLength(3);
    expect(fetch.calls).toHaveLength(2);
  });
});

describe("회차 제안·멱등 키", () => {
  it("최신 draw_no + max(1, ceil(경과일/7)), 8일 초과면 확인 필요", async () => {
    const { core, clock } = setup((url) => (url.includes("draws_lotto") ? { body: [DRAW_LOTTO] } : { body: [] }));
    expect(await core.tickets.suggestRound("lotto")).toStrictEqual({ round: 1201, needs_confirmation: false }); // 5일
    clock.time = Date.parse("2026-11-14T15:00:00.000Z"); // KST 11-15, 8일
    expect(await core.tickets.suggestRound("lotto")).toStrictEqual({ round: 1202, needs_confirmation: false });
    expect(await core.tickets.defaultRound("lotto")).toBe(1202);
    clock.time = Date.parse("2026-11-21T15:00:00.000Z"); // KST 11-22, 15일
    expect(await core.tickets.suggestRound("lotto")).toStrictEqual({ round: 1203, needs_confirmation: true });
    expect(await core.tickets.defaultRound("lotto")).toBeNull();
    expect(await core.tickets.suggestRound("pension")).toStrictEqual({ round: null, needs_confirmation: true });
  });

  it("newIdempotencyKey: uuid v4, 저장 레코드 id가 된다", async () => {
    const { core } = setup(() => new Error("offline"));
    const key = core.tickets.newIdempotencyKey();
    expect(key).toMatch(UUID_RE);
    expect(newIdempotencyKey({ fill: (b) => b.fill(7) })).toMatch(UUID_RE);
    const t = await core.tickets.save({
      game: "lotto",
      ticket_data: { nums: [1, 2, 3, 4, 5, 6] },
      round: null,
      purchase_status: "favorite",
      idempotency_key: key,
    });
    expect(t.id).toBe(key);
  });
});
