// 운세·테마 번호(task-038): 같은 날 같은 입력 → 같은 번호, generated·method 저장, 입력값 미저장, 기기 비밀값(CSPRNG 32바이트·재사용·내보내기 제외).
import { describe, expect, it, vi } from "vitest";
import { FORTUNE_SECRET_KEY, KEY_PREFIX, createAppCore, type FortuneRequest } from "../src/index.ts";
import { CONFIG, MockClock, MockKv, adapters, mockFetch } from "./helpers.ts";

function setup(kv = new MockKv({ maxDelayMs: 0 }), clock = new MockClock(), seed = 12345) {
  const fetch = mockFetch(() => new Error("offline"));
  const a = adapters(kv, clock, fetch, seed);
  const fill = vi.spyOn(a.random, "fill");
  const core = createAppCore(a, CONFIG);
  return { kv, clock, fetch, fill, core };
}

const DREAM: FortuneRequest = { game: "lotto", theme: { kind: "dream", keywords: ["pig", "water"] } };
const BIRTHDAY: FortuneRequest = { game: "lotto", theme: { kind: "birthday", date: "1987-03-21" } };
const nums = (records: { numbers: unknown }[]) => records.map((r) => r.numbers);

describe("FortuneService", () => {
  it("같은 날 같은 입력은 같은 번호, 다른 날은 다른 번호(같은 기기)", async () => {
    const { core, clock } = setup();
    const a = await core.fortune.generate(DREAM);
    const b = await core.fortune.generate(DREAM);
    expect(a.records).toHaveLength(5);
    expect(nums(b.records)).toStrictEqual(nums(a.records));
    expect(b.batch_id).not.toBe(a.batch_id);
    clock.advance(24 * 60 * 60 * 1000);
    const c = await core.fortune.generate(DREAM);
    expect(nums(c.records)).not.toStrictEqual(nums(a.records));
  });

  it("저장 레코드는 generated 이력(method = 엔진 결과), 저장 번호(ticket)는 만들지 않는다", async () => {
    const { core, kv } = setup();
    const r = await core.fortune.generate(BIRTHDAY);
    expect(r.saved).toBe(true);
    expect(r.method).toBe("birthday");
    const stored = kv.keysOf(`${KEY_PREFIX}generated:`).map((k) => JSON.parse(kv.data.get(k)!));
    expect(stored).toHaveLength(5);
    for (const s of stored) expect(s).toMatchObject({ method: "birthday", game: "lotto", engine_version: "fortune@1+lotto@1" });
    expect(kv.keysOf(`${KEY_PREFIX}ticket:`)).toHaveLength(0);
    expect((await core.fortune.generate({ game: "lotto", theme: { kind: "zodiac_sign", sign: "leo" } })).method).toBe("zodiac");
    const pension = await core.fortune.generate({ game: "pension", groups: [1, 3], theme: { kind: "dream", keywords: ["dragon"] } });
    expect(pension.records.map((x) => x.group_no)).toStrictEqual([1, 3]);
    expect(pension.records.every((x) => x.game === "pension" && typeof x.numbers === "object" && /^[0-9]{6}$/.test((x.numbers as { digits: string }).digits))).toBe(true);
  });

  it("테마 입력값은 저장소·네트워크 어디에도 없다", async () => {
    const { core, kv, fetch } = setup();
    await core.fortune.generate(BIRTHDAY);
    await core.fortune.generate(DREAM);
    await core.fortune.generate({ game: "lotto", theme: { kind: "anniversary", date: "2019-06-08" } });
    const dump = [...kv.data.entries()].map(([k, v]) => `${k}=${v}`).join("\n");
    for (const value of ["1987-03-21", "19870321", "2019-06-08", "pig", "water", "anniversary", "keywords", "theme"]) {
      expect(dump).not.toContain(value);
    }
    expect(fetch.calls).toHaveLength(0);
  });

  it("엔진 입력 오류는 그대로 던지고 아무것도 저장하지 않는다", async () => {
    const { core, kv } = setup();
    await expect(core.fortune.generate({ game: "lotto", theme: { kind: "birthday", date: "2999-01-01" } })).rejects.toMatchObject({
      code: "INVALID_INPUT",
      hint: "fortune.birthday",
    });
    expect(kv.keysOf(`${KEY_PREFIX}generated:`)).toHaveLength(0);
  });

  it("기기 비밀값: RandomBytes 32바이트 → 64자 소문자 hex, 한 번 만들면 재사용, 내보내기에 없음", async () => {
    const { core, kv, fill } = setup();
    await core.fortune.generate(DREAM);
    const first = fill.mock.calls[0]![0];
    expect(first).toBeInstanceOf(Uint32Array);
    expect(first.byteLength).toBe(32);
    const secret = JSON.parse(kv.data.get(FORTUNE_SECRET_KEY)!) as string;
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(secret).toBe([...first].map((w) => w.toString(16).padStart(8, "0")).join(""));

    const before = fill.mock.calls.filter(([b]) => b.byteLength === 32).length;
    await core.fortune.generate(DREAM);
    expect(fill.mock.calls.filter(([b]) => b.byteLength === 32).length).toBe(before);
    expect(JSON.parse(kv.data.get(FORTUNE_SECRET_KEY)!)).toBe(secret);

    // 앱을 다시 켜도(새 인스턴스) 같은 비밀값 → 같은 번호. 다른 기기(다른 비밀값)는 다른 번호.
    const again = setup(kv, new MockClock(), 999);
    const other = setup(new MockKv({ maxDelayMs: 0 }), new MockClock(), 999);
    const mine = await core.fortune.generate(DREAM);
    expect(nums((await again.core.fortune.generate(DREAM)).records)).toStrictEqual(nums(mine.records));
    expect(nums((await other.core.fortune.generate(DREAM)).records)).not.toStrictEqual(nums(mine.records));

    const exported = await core.data.exportJson();
    expect(exported).not.toContain(secret);
    expect(exported).not.toContain("fortune_secret");
  });

  it("형식이 깨진 비밀값은 새로 만들고, 비밀값을 쓰지 못하면 STORAGE_FAILED(이력 저장 없음)", async () => {
    const kv = new MockKv({ maxDelayMs: 0 });
    kv.data.set(FORTUNE_SECRET_KEY, JSON.stringify("ABC"));
    const { core } = setup(kv);
    await core.fortune.generate(DREAM);
    expect(JSON.parse(kv.data.get(FORTUNE_SECRET_KEY)!)).toMatch(/^[0-9a-f]{64}$/);

    const broken = new MockKv({ maxDelayMs: 0 });
    broken.fail = (op, key) => op === "set" && key === FORTUNE_SECRET_KEY;
    await expect(setup(broken).core.fortune.generate(DREAM)).rejects.toMatchObject({ code: "STORAGE_FAILED" });
    expect(broken.keysOf(`${KEY_PREFIX}generated:`)).toHaveLength(0);
  });

  it("사주 표시 계산(sajuChart): 오늘(KST) 기준 변환·실패, 저장·비밀값 사용 없음", () => {
    const { core, kv, fill } = setup(); // 시계 = 2026-11-12 12:00 KST
    expect(core.fortune.sajuChart({ date: "2024-02-10", calendar: "solar", leap: false, hour: null })).toMatchObject({ ok: true, boundary: false });
    expect(core.fortune.sajuChart({ date: "2026-11-12", calendar: "solar", leap: false, hour: "ja" }).ok).toBe(true);
    expect(core.fortune.sajuChart({ date: "2026-11-13", calendar: "solar", leap: false, hour: null })).toEqual({ ok: false, reason: "UNCONVERTIBLE_DATE" });
    expect(kv.keysOf(KEY_PREFIX)).toHaveLength(0);
    expect(fill).not.toHaveBeenCalled();
  });
});
