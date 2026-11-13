// 사주 프로필(task-041, A-17): upsert 5열 명시·시각 모름=null, 오류 코드 매핑, 오류·결과에 생년월일 없음(직렬화), 저장소 미사용,
// 같은 날 같은 사주 입력은 같은 번호(method=saju, generated).
import { describe, expect, it, vi } from "vitest";
import {
  FortuneProfileService,
  KEY_PREFIX,
  createAppCore,
  type FortuneProfileClient,
  type FortuneProfileFailure,
  type FortuneProfileResult,
  type FortuneProfileRow,
} from "../src/index.ts";
import { CONFIG, MockClock, MockKv, adapters, mockFetch } from "./helpers.ts";

const DATE = "1990-03-15";
const ROW: FortuneProfileRow = { birth_date: DATE, calendar: "solar", is_leap_month: false, birth_hour: null };

function fakeClient(overrides: Partial<FortuneProfileClient> = {}) {
  const client = {
    get: vi.fn(async (): Promise<FortuneProfileResult<FortuneProfileRow | null>> => ({ ok: true, value: ROW })),
    upsert: vi.fn(async (): Promise<FortuneProfileResult<null>> => ({ ok: true, value: null })),
    delete: vi.fn(async (): Promise<FortuneProfileResult<null>> => ({ ok: true, value: null })),
    ...overrides,
  };
  return { client, service: new FortuneProfileService(client) };
}

const failWith = (failure: FortuneProfileFailure) => async () => ({ ok: false as const, failure });
const INPUT = { birth_date: DATE, calendar: "solar", is_leap_month: false, birth_hour: null };

describe("FortuneProfileService.save", () => {
  it("동의 없이는 저장하지 않는다(서버 호출 없음)", async () => {
    const { client, service } = fakeClient();
    expect(await service.save(INPUT, false)).toEqual({ ok: false, code: "CONSENT_REQUIRED", field: "consent" });
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it("upsert는 5개 열을 항상 명시한다 — 시각 모름은 null, 양력이면 윤달 false", async () => {
    const { client, service } = fakeClient();
    await service.save({ birth_date: DATE, calendar: "solar", is_leap_month: false, birth_hour: "" }, true);
    expect(client.upsert).toHaveBeenLastCalledWith({ birth_date: DATE, calendar: "solar", is_leap_month: false, birth_hour: null });
    await service.save({ birth_date: "1989-05-02", calendar: "lunar", is_leap_month: true, birth_hour: "myo" }, true);
    expect(client.upsert).toHaveBeenLastCalledWith({ birth_date: "1989-05-02", calendar: "lunar", is_leap_month: true, birth_hour: "myo" });
    // 시각 있음 → 모름: 이전 값이 남지 않도록 birth_hour: null을 명시해 보낸다.
    await service.save({ birth_date: "1989-05-02", calendar: "lunar", is_leap_month: false, birth_hour: null }, true);
    const sent = (client.upsert as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as FortuneProfileRow;
    expect(Object.keys(sent).sort()).toEqual(["birth_date", "birth_hour", "calendar", "is_leap_month"]);
    expect(sent.birth_hour).toBeNull();
  });

  it("클라이언트 검증은 필수·형식뿐: 날짜 형식·시진 ID·양력 윤달", async () => {
    const { client, service } = fakeClient();
    expect(await service.save({ ...INPUT, birth_date: "1990-3-5" }, true)).toMatchObject({ ok: false, code: "INVALID_INPUT", field: "birth_date" });
    expect(await service.save({ ...INPUT, birth_hour: "25" }, true)).toMatchObject({ ok: false, code: "INVALID_INPUT", field: "birth_hour" });
    expect(await service.save({ ...INPUT, is_leap_month: true }, true)).toMatchObject({ ok: false, code: "INVALID_INPUT", field: "is_leap_month" });
    expect(await service.save({ ...INPUT, calendar: "x" }, true)).toMatchObject({ ok: false, code: "INVALID_INPUT", field: "calendar" });
    expect(client.upsert).not.toHaveBeenCalled();
    // 범위(미래·1900 이전)는 DB CHECK가 판정한다 — 클라이언트는 통과시킨다.
    expect((await service.save({ ...INPUT, birth_date: "2999-01-01" }, true)).ok).toBe(true);
  });
});

describe("오류 코드 매핑", () => {
  const cases: [FortuneProfileFailure, string][] = [
    [{ code: null, status: 0, network: true }, "OFFLINE"],
    [{ code: null, status: 0 }, "OFFLINE"],
    [{ code: null, status: 401 }, "SESSION_EXPIRED"],
    [{ code: "PGRST301", status: 401 }, "SESSION_EXPIRED"],
    [{ code: "PGRST303", status: 401 }, "SESSION_EXPIRED"],
    [{ code: "42501", status: 403 }, "FORBIDDEN"],
    [{ code: "23514", status: 400 }, "INVALID_INPUT"],
    [{ code: "22007", status: 400 }, "INVALID_INPUT"],
    [{ code: "XX000", status: 500 }, "UNKNOWN"],
    [{ code: null, status: null }, "UNKNOWN"],
  ];
  it.each(cases)("%j → %s", async (failure, code) => {
    const { service } = fakeClient({ upsert: failWith(failure) });
    expect(await service.save(INPUT, true)).toMatchObject({ ok: false, code });
  });

  it("서버 CHECK 위반(23514)은 날짜 입력 오류로 돌려준다", async () => {
    const { service } = fakeClient({ upsert: failWith({ code: "23514", status: 400 }) });
    expect(await service.save(INPUT, true)).toEqual({ ok: false, code: "INVALID_INPUT", field: "birth_date" });
  });

  it("예외(메시지에 생년월일이 있어도)·실패 결과 어디에도 생년월일이 직렬화되지 않는다", async () => {
    const leaky = { ...new Error(`Failing row contains (uid, ${DATE}, solar, f, null)`), detail: `Failing row contains (${DATE})`, hint: DATE, message: DATE };
    const { service } = fakeClient({
      get: async () => {
        throw leaky;
      },
      upsert: async () => {
        throw leaky;
      },
      delete: async () => {
        throw leaky;
      },
    });
    const outcomes = [await service.load(), await service.save(INPUT, true), await service.remove()];
    for (const outcome of outcomes) {
      expect(outcome).toEqual({ ok: false, code: "UNKNOWN" });
      expect(JSON.stringify(outcome)).not.toContain("1990");
      expect(outcome).not.toHaveProperty("cause");
    }
    const withDetail = fakeClient({
      upsert: async () => ({ ok: false, failure: { code: "23514", status: 400, detail: `Failing row contains (${DATE})` } as FortuneProfileFailure }),
    });
    const out = await withDetail.service.save(INPUT, true);
    expect(JSON.stringify(out)).not.toContain("1990");
  });
});

describe("load·remove", () => {
  it("0행은 null, 형식이 틀린 서버 값은 UNKNOWN, 삭제는 클라이언트 delete 호출", async () => {
    const empty = fakeClient({ get: async () => ({ ok: true, value: null }) });
    expect(await empty.service.load()).toEqual({ ok: true, value: null });
    const bad = fakeClient({ get: async () => ({ ok: true, value: { ...ROW, birth_hour: "zz" } }) });
    expect(await bad.service.load()).toEqual({ ok: false, code: "UNKNOWN" });
    const { client, service } = fakeClient();
    expect(await service.load()).toEqual({ ok: true, value: ROW });
    expect(await service.remove()).toEqual({ ok: true, value: null });
    expect(client.delete).toHaveBeenCalledTimes(1);
  });
});

describe("createAppCore 연결", () => {
  it("fortuneProfile 어댑터가 없으면 null, 있으면 서비스. 로컬 저장소에는 아무것도 쓰지 않는다", async () => {
    const kv = new MockKv({ maxDelayMs: 0 });
    const base = adapters(kv, new MockClock(), mockFetch(() => new Error("offline")), 1);
    expect(createAppCore(base, CONFIG).fortuneProfile).toBeNull();
    const { client } = fakeClient();
    const core = createAppCore({ ...base, fortuneProfile: client }, CONFIG);
    await core.fortuneProfile!.save({ ...INPUT, birth_hour: "o" }, true);
    await core.fortuneProfile!.load();
    await core.fortuneProfile!.remove();
    expect([...kv.data.keys()]).toEqual([]);
    expect(kv.setCount).toBe(0);
  });

  it("같은 날 같은 사주 입력은 같은 번호(method=saju, generated), 프로필 값은 저장 레코드에 없다", async () => {
    const kv = new MockKv({ maxDelayMs: 0 });
    const a = adapters(kv, new MockClock(), mockFetch(() => new Error("offline")), 7);
    const core = createAppCore(a, CONFIG);
    const theme = { kind: "saju" as const, birth: { calendar: "solar" as const, date: DATE, leap: false, hour: "myo" as const } };
    const first = await core.fortune.generate({ game: "lotto", theme });
    const second = await core.fortune.generate({ game: "lotto", theme });
    expect(first.method).toBe("saju");
    expect(second.records.map((r) => r.numbers)).toStrictEqual(first.records.map((r) => r.numbers));
    const stored = kv.keysOf(`${KEY_PREFIX}generated:`).map((k) => kv.data.get(k)!);
    expect(stored.length).toBe(10);
    for (const raw of stored) {
      expect(JSON.parse(raw)).toMatchObject({ method: "saju", game: "lotto" });
      expect(raw).not.toContain(DATE);
    }
    expect([...kv.data.values()].some((v) => v.includes(DATE))).toBe(false);
  });
});
