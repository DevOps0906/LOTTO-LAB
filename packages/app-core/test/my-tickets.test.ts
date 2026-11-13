// task-022·023 추가 기능: 저장 번호 1개 읽기·회차 입력·제거 실행 취소, 1건 판정, 19세 확인 시각, 로컬 데이터 내보내기·모두 삭제, 테마 선호.
import { describe, expect, it } from "vitest";
import { AppCoreError, THEME_KEY, TICKET_LIMIT, createAppCore, recordKey } from "../src/index.ts";
import { CONFIG, DRAW_PENSION, MockClock, MockKv, adapters, mockFetch } from "./helpers.ts";

function setup(respond: Parameters<typeof mockFetch>[0] = () => new Error("offline")) {
  const kv = new MockKv({ maxDelayMs: 0 });
  const clock = new MockClock();
  const fetch = mockFetch(respond);
  const core = createAppCore(adapters(kv, clock, fetch), CONFIG);
  return { kv, clock, fetch, core };
}

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  return p.then(
    () => null,
    (e: unknown) => (e instanceof AppCoreError ? e.code : String(e)),
  );
}

const PENSION_TICKET = { game: "pension" as const, ticket_data: { group_no: 1, digits: "000719" } };

describe("저장 번호 get·setRound·restore", () => {
  it("get: 있으면 레코드, 없으면 null", async () => {
    const { core } = setup();
    const t = await core.tickets.save({ ...PENSION_TICKET, purchase_status: "favorite", round: null });
    expect((await core.tickets.get(t.id))?.ticket_data).toStrictEqual({ group_no: 1, digits: "000719" });
    expect(await core.tickets.get("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("setRound: 회차만 바꾸고 상태·번호는 그대로, 같은 회차는 멱등, 없는 id는 NOT_FOUND", async () => {
    const { core, clock } = setup();
    const t = await core.tickets.save({ ...PENSION_TICKET, purchase_status: "purchased", purchase_date: "2026-11-10", round: null });
    clock.advance(1000);
    const r = await core.tickets.setRound(t.id, 291);
    expect(r).toMatchObject({ round: 291, purchase_status: "purchased", purchase_date: "2026-11-10", ticket_data: { digits: "000719" } });
    expect(r.updated_at).not.toBe(t.updated_at);
    expect(await core.tickets.setRound(t.id, 291)).toStrictEqual(r);
    expect(await codeOf(core.tickets.setRound(t.id, 0))).toBe("INVALID_INPUT");
    expect(await codeOf(core.tickets.setRound("00000000-0000-4000-8000-000000000000", 1))).toBe("NOT_FOUND");
  });

  it("restore: 제거한 레코드를 id·created_at·상태 그대로 되돌리고, 이미 있으면 덮어쓰지 않는다", async () => {
    const { core, kv } = setup();
    const t = await core.tickets.save({ ...PENSION_TICKET, purchase_status: "purchased", purchase_date: "2026-11-10", round: 290 });
    await core.tickets.remove(t.id);
    expect(await core.tickets.list()).toHaveLength(0);
    expect(await core.tickets.restore(t)).toStrictEqual(t);
    expect(await core.tickets.restore(t)).toStrictEqual(t);
    expect(await core.tickets.list()).toStrictEqual([t]);
    // 같은 키 자리에 격리 레코드가 있으면 거부
    await core.tickets.remove(t.id);
    kv.data.set(recordKey("ticket", t.id), "{broken");
    expect(await codeOf(core.tickets.restore(t))).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("restore도 상한(1000)을 지킨다", async () => {
    const { core, kv } = setup();
    const t = await core.tickets.save({ ...PENSION_TICKET, purchase_status: "favorite", round: null });
    await core.tickets.remove(t.id);
    for (let i = 0; i < TICKET_LIMIT; i++) kv.data.set(recordKey("ticket", `filler-${i}`), "{}");
    expect(await codeOf(core.tickets.restore(t))).toBe("LIMIT_EXCEEDED");
  });
});

describe("purchase(즐겨찾기 → 구매 원자 전환)", () => {
  it("한 번의 쓰기로 상태·구매일·금액·회차 갱신, 재호출은 같은 결과(추가 쓰기 없음)", async () => {
    const { core, kv, clock } = setup();
    const fav = await core.tickets.save({ ...PENSION_TICKET, purchase_status: "favorite", round: null });
    clock.advance(1000);
    const before = kv.setCount;
    const p = await core.tickets.purchase(fav.id, { round: 291, purchase_date: "2026-11-12", amount_won: 1000 });
    expect(kv.setCount - before).toBe(1);
    expect(p).toMatchObject({ id: fav.id, purchase_status: "purchased", purchase_date: "2026-11-12", amount_won: 1000, round: 291, ticket_data: { digits: "000719" } });
    const again = await core.tickets.purchase(fav.id, { round: 291, purchase_date: "2026-11-12", amount_won: 1000 });
    expect(again).toStrictEqual(p);
    expect(kv.setCount - before).toBe(1);
    expect(await core.tickets.list()).toHaveLength(1);
  });

  it("입력 오류·쓰기 실패면 원래 레코드 그대로(중간 상태 없음), 없는 id는 NOT_FOUND", async () => {
    const { core, kv } = setup();
    const fav = await core.tickets.save({ ...PENSION_TICKET, purchase_status: "favorite", round: null });
    expect(await codeOf(core.tickets.purchase(fav.id, { round: 0, purchase_date: "2026-11-12" }))).toBe("INVALID_INPUT");
    expect(await codeOf(core.tickets.purchase(fav.id, { round: 1, purchase_date: "2026/11/12" }))).toBe("INVALID_INPUT");
    kv.fail = (op) => op === "set";
    expect(await codeOf(core.tickets.purchase(fav.id, { round: 291, purchase_date: "2026-11-12" }))).toBe("STORAGE_FAILED");
    kv.fail = () => false;
    expect(await core.tickets.get(fav.id)).toStrictEqual(fav);
    expect(await codeOf(core.tickets.purchase("00000000-0000-4000-8000-000000000000", { round: 1, purchase_date: "2026-11-12" }))).toBe("NOT_FOUND");
    // 회차 없이 구매 전환(round null)도 허용
    expect(await core.tickets.purchase(fav.id, { round: null, purchase_date: "2026-11-12" })).toMatchObject({ purchase_status: "purchased", round: null, amount_won: null });
  });
});

describe("checkTicket(1건 판정)", () => {
  it("purchased만 판정 — favorite·없는 id는 null, 회차 미입력은 no_round", async () => {
    const { core } = setup((url) => (url.includes("draws_pension") ? { body: [DRAW_PENSION] } : { body: [] }));
    const fav = await core.tickets.save({ ...PENSION_TICKET, purchase_status: "favorite", round: 290 });
    const noRound = await core.tickets.save({ ...PENSION_TICKET, purchase_status: "purchased", purchase_date: "2026-11-05", round: null });
    const bought = await core.tickets.save({
      game: "pension",
      ticket_data: { group_no: 1, digits: "123450" },
      purchase_status: "purchased",
      purchase_date: "2026-11-05",
      round: 290,
    });
    expect(await core.checker.checkTicket(fav.id)).toBeNull();
    expect(await core.checker.checkTicket("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await core.checker.checkTicket(noRound.id)).toMatchObject({ status: "no_round" });
    // 보너스(123450) 일치 + 끝자리 0 일치(7등)는 따로 표시된다
    expect(await core.checker.checkTicket(bought.id)).toMatchObject({
      status: "checked",
      draw_no: 290,
      result: { matched_rank: null, bonus_hit: true },
      source_url: DRAW_PENSION.source_url,
    });
  });
});

describe("19세 확인 시각", () => {
  it("미확인 null → 확인 후 시각", async () => {
    const { core } = setup();
    expect(await core.ageGate.confirmedAt()).toBeNull();
    const at = await core.ageGate.confirm();
    expect(await core.ageGate.confirmedAt()).toBe(at);
  });
});

describe("로컬 데이터 내보내기·모두 삭제", () => {
  it("내보내기: 저장 번호·생성 이력·설정, 연금 000719는 문자열 그대로", async () => {
    const { core } = setup();
    await core.ageGate.confirm();
    await core.tickets.save({ ...PENSION_TICKET, purchase_status: "favorite", round: null });
    await core.generator.generate({ game: "lotto", config: { fixed: [], excluded: [], games: 2 } });
    expect(await core.data.summary()).toStrictEqual({ tickets: 1, favorites: 1, purchased: 0, generated: 2 });
    const json = await core.data.exportJson();
    expect(json).toContain('"digits": "000719"');
    const parsed = JSON.parse(json);
    expect(parsed).toMatchObject({ format: "lotto-lab-local", format_version: 1, exported_at: "2026-11-12T03:00:00.000Z" });
    expect(parsed.tickets).toHaveLength(1);
    expect(parsed.generated).toHaveLength(2);
    expect(parsed.settings.age_confirmed_at).toBe("2026-11-12T03:00:00.000Z");
  });

  it("모두 삭제: ll: 키 전부(격리·캐시·테마 포함) 삭제, 다른 앱 키는 그대로", async () => {
    const { core, kv } = setup();
    await core.ageGate.confirm();
    await core.theme.set("dark");
    await core.tickets.save({ ...PENSION_TICKET, purchase_status: "favorite", round: null });
    kv.data.set(recordKey("ticket", "quarantined"), "{broken");
    kv.data.set("other-app:key", "x");
    expect(await core.data.clearAll()).toBe(4);
    expect([...kv.data.keys()]).toStrictEqual(["other-app:key"]);
    expect(await core.ageGate.isConfirmed()).toBe(false);
    expect(await core.theme.get()).toBe("system");
  });

  it("삭제 중 실패는 STORAGE_FAILED", async () => {
    const { core, kv } = setup();
    await core.ageGate.confirm();
    kv.fail = (op) => op === "delete";
    expect(await codeOf(core.data.clearAll())).toBe("STORAGE_FAILED");
  });
});

describe("테마 선호", () => {
  it("기본 system, 저장·읽기, 잘못된 값은 INVALID_INPUT, 알 수 없는 저장값은 system", async () => {
    const { core, kv } = setup();
    expect(await core.theme.get()).toBe("system");
    expect(await core.theme.set("dark")).toBe("dark");
    expect(await core.theme.get()).toBe("dark");
    expect(kv.data.get(THEME_KEY)).toBe('"dark"');
    expect(await codeOf(core.theme.set("blue" as "dark"))).toBe("INVALID_INPUT");
    kv.data.set(THEME_KEY, "purple");
    expect(await core.theme.get()).toBe("system");
  });
});
