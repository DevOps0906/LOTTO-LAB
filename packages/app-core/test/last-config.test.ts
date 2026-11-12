// 지난 설정(task-018·019): 복권별 저장·복원, 19세 확인 시각 보존, 격리 설정 레코드 비덮어쓰기, 형식 검사.
import { describe, expect, it } from "vitest";
import { AppCoreError, createAppCore, recordKey } from "../src/index.ts";
import { CONFIG, MockClock, MockKv, adapters, mockFetch } from "./helpers.ts";

function setup() {
  const kv = new MockKv({ maxDelayMs: 0 });
  const core = createAppCore(adapters(kv, new MockClock(), mockFetch(() => new Error("offline"))), CONFIG);
  return { kv, core };
}

const LOTTO = { fixed: [7, 12], excluded: [1], games: 5 };
const PENSION = { groups: [1, 2, 3, 4, 5], positions: ["0", "0", "0", "7", "1", "9"], games: 1 };

describe("지난 설정", () => {
  it("없으면 null, 복권별로 따로 저장·복원(연금 자리는 문자열 그대로)", async () => {
    const { core } = setup();
    expect(await core.lastConfig.get("lotto")).toBeNull();
    expect(await core.lastConfig.save({ game: "lotto", config: LOTTO })).toBe(true);
    expect(await core.lastConfig.save({ game: "pension", config: PENSION })).toBe(true);
    expect(await core.lastConfig.get("lotto")).toStrictEqual(LOTTO);
    expect(await core.lastConfig.get("pension")).toStrictEqual(PENSION);
    const next = { fixed: [], excluded: [], games: 1 };
    await core.lastConfig.save({ game: "lotto", config: next });
    expect(await core.lastConfig.get("lotto")).toStrictEqual(next);
    expect(await core.lastConfig.get("pension")).toStrictEqual(PENSION);
  });

  it("19세 확인 시각을 지우지 않고, 확인 전에 저장해도 확인 상태는 미확인", async () => {
    const { core, kv } = setup();
    await core.lastConfig.save({ game: "lotto", config: LOTTO });
    expect(await core.ageGate.isConfirmed()).toBe(false);
    const at = await core.ageGate.confirm();
    expect(await core.lastConfig.get("lotto")).toStrictEqual(LOTTO);
    await core.lastConfig.save({ game: "pension", config: PENSION });
    expect(await core.ageGate.isConfirmed()).toBe(true);
    expect(JSON.parse(kv.data.get(recordKey("settings", "app"))!)).toStrictEqual({
      v: 1,
      age_confirmed_at: at,
      last_config: { lotto: LOTTO, pension: PENSION },
    });
  });

  it("격리(미래 버전) 설정 레코드는 덮어쓰지 않는다", async () => {
    const { core, kv } = setup();
    const future = JSON.stringify({ v: 99 });
    kv.data.set(recordKey("settings", "app"), future);
    expect(await core.lastConfig.save({ game: "lotto", config: LOTTO })).toBe(false);
    expect(await core.lastConfig.get("lotto")).toBeNull();
    expect(kv.data.get(recordKey("settings", "app"))).toBe(future);
  });

  it("형식이 틀린 조건은 INVALID_INPUT, 쓰기 실패는 STORAGE_FAILED", async () => {
    const { core, kv } = setup();
    const bad = core.lastConfig.save({ game: "lotto", config: { fixed: [], excluded: [], games: 0 } });
    await expect(bad).rejects.toBeInstanceOf(AppCoreError);
    await expect(bad).rejects.toMatchObject({ code: "INVALID_INPUT" });
    kv.fail = (op) => op === "set";
    await expect(core.lastConfig.save({ game: "lotto", config: LOTTO })).rejects.toMatchObject({ code: "STORAGE_FAILED" });
    kv.fail = () => false;
    expect(await core.lastConfig.get("lotto")).toBeNull();
  });
});
