// 회차 목록(M-16): 키셋 페이지 쿼리·행 검증·최신 페이지만 캐시·오프라인 stale·입력 검증.
import { describe, expect, it } from "vitest";
import { AppCoreError, DRAW_CACHE_TTL_MS, DRAW_PAGE_MAX, createAppCore } from "../src/index.ts";
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

const lotto = (draw_no: number) => ({ ...DRAW_LOTTO, draw_no });
const BASE = "https://project.example.test/rest/v1/";

describe("listDraws", () => {
  it("최신 페이지: draw_no 내림차순·limit 쿼리, 검증 후 캐시(TTL 안은 네트워크 없음)", async () => {
    const { core, fetch, clock } = setup(() => ({ body: [lotto(1200), lotto(1199)] }));
    const a = await core.reader.listDraws("lotto", { limit: 2 });
    expect(a.stale).toBe(false);
    expect(a.data?.map((d) => d.draw_no)).toEqual([1200, 1199]);
    expect(fetch.calls[0]!.url).toBe(
      `${BASE}draws_lotto?select=draw_no,draw_date,nums,bonus,prizes,source_url,source_verified_at&order=draw_no.desc&limit=2`,
    );
    clock.advance(DRAW_CACHE_TTL_MS - 1);
    await core.reader.listDraws("lotto", { limit: 2 });
    expect(fetch.calls).toHaveLength(1);
    await core.reader.listDraws("lotto", { limit: 2, force: true });
    expect(fetch.calls).toHaveLength(2);
  });

  it("다음 페이지: before 미만 키셋 쿼리, 캐시하지 않음", async () => {
    const { core, fetch, kv } = setup(() => ({ body: [lotto(1180), lotto(1179)] }));
    const r = await core.reader.listDraws("lotto", { before: 1181, limit: 2 });
    expect(r.data?.map((d) => d.draw_no)).toEqual([1180, 1179]);
    expect(fetch.calls[0]!.url).toContain("&draw_no=lt.1181&order=draw_no.desc&limit=2");
    expect(kv.keysOf("ll:v1:cache:")).toHaveLength(0);
  });

  it("연금: 문자열 6자리 유지(000719)", async () => {
    const { core } = setup(() => ({ body: [DRAW_PENSION] }));
    const r = await core.reader.listDraws("pension");
    expect(r.data?.[0]?.digits).toBe("000719");
  });

  it("0행은 빈 배열(미수집), 오류 아님", async () => {
    const { core } = setup(() => ({ body: [] }));
    expect(await core.reader.listDraws("lotto")).toMatchObject({ data: [], stale: false });
  });

  it("검증 실패(행 오류·순서 어긋남·before 이상·limit 초과)는 INVALID_RESPONSE, 최신 페이지는 마지막 정상본 유지", async () => {
    const { core, setRespond, clock } = setup(() => ({ body: [lotto(1200)] }));
    await core.reader.listDraws("lotto", { limit: 2 });
    for (const body of [[{ ...lotto(1199), nums: [1, 1, 2, 3, 4, 5] }], [lotto(1198), lotto(1199)], [lotto(1), lotto(2), lotto(3)]]) {
      setRespond(() => ({ body }));
      clock.advance(DRAW_CACHE_TTL_MS + 1);
      const r = await core.reader.listDraws("lotto", { limit: 2 });
      expect(r).toMatchObject({ stale: true, error: "INVALID_RESPONSE" });
      expect(r.data?.map((d) => d.draw_no)).toEqual([1200]);
    }
    setRespond(() => ({ body: [lotto(1300)] }));
    expect(await core.reader.listDraws("lotto", { before: 1250 })).toMatchObject({ data: null, stale: true, error: "INVALID_RESPONSE" });
  });

  it("오프라인: 최신 페이지는 캐시 stale, 다음 페이지는 data null + NETWORK", async () => {
    const { core, setRespond, clock } = setup(() => ({ body: [lotto(1200)] }));
    await core.reader.listDraws("lotto");
    setRespond(() => new Error("offline"));
    clock.advance(DRAW_CACHE_TTL_MS + 1);
    expect(await core.reader.listDraws("lotto")).toMatchObject({ stale: true, error: "NETWORK", data: [{ draw_no: 1200 }] });
    expect(await core.reader.listDraws("lotto", { before: 1200 })).toMatchObject({ stale: true, error: "NETWORK", data: null });
  });

  it("입력 검증: limit 1~최대, before 정수 ≥1", async () => {
    const { core, fetch } = setup(() => ({ body: [] }));
    for (const o of [{ limit: 0 }, { limit: DRAW_PAGE_MAX + 1 }, { limit: 1.5 }, { before: 0 }, { before: Number.NaN }]) {
      await expect(core.reader.listDraws("lotto", o)).rejects.toBeInstanceOf(AppCoreError);
    }
    expect(fetch.calls).toHaveLength(0);
  });
});
