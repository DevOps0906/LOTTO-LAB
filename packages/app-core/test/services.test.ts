// 생성·저장 번호·19세 확인 서비스: 상태 분리(추천→구매 미승격), 전환 규칙, 멱등, 상한, 이력 200개·참조 보존, 회차 기본값.
import { describe, expect, it } from "vitest";
import { EngineError } from "@lotto-lab/lottery-core";
import { LOCAL_RECORD_VERSION } from "@lotto-lab/validation";
import { AppCoreError, GENERATED_HISTORY_LIMIT, TICKET_LIMIT, createAppCore, recordKey } from "../src/index.ts";
import { CONFIG, DRAW_LOTTO, MockClock, MockKv, adapters, mockFetch } from "./helpers.ts";

function setup(respond: Parameters<typeof mockFetch>[0] = () => new Error("offline")) {
  const kv = new MockKv({ maxDelayMs: 0 });
  const clock = new MockClock();
  const fetch = mockFetch(respond);
  const core = createAppCore(adapters(kv, clock, fetch), CONFIG);
  return { kv, clock, fetch, core };
}

async function expectCode(p: Promise<unknown>, code: AppCoreError["code"]): Promise<void> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(AppCoreError);
  expect((e as AppCoreError).code).toBe(code);
}

const NUMS = { nums: [3, 11, 17, 25, 33, 41] };

describe("생성(DF-1) — 상태 분리", () => {
  it("로또 생성은 생성 이력만 남기고 저장 번호를 만들지 않는다", async () => {
    const { core, kv } = setup();
    const r = await core.generator.generate({ game: "lotto", config: { fixed: [7], excluded: [], games: 5 } });
    expect(r.saved).toBe(true);
    expect(r.records).toHaveLength(5);
    expect(r.records.every((g) => g.method === "condition" && g.engine_version === "lotto@1" && "nums" in g.numbers && g.numbers.nums.includes(7))).toBe(true);
    expect(r.records.map((g) => g.line_no)).toStrictEqual([1, 2, 3, 4, 5]);
    expect(await core.generator.history()).toHaveLength(5);
    expect(await core.tickets.list()).toHaveLength(0);
    expect(kv.keysOf(recordKey("ticket", ""))).toHaveLength(0);
  });

  it("연금 생성: 문자열 6자리·조 보존, 조건 없으면 random", async () => {
    const { core } = setup();
    const r = await core.generator.generate({
      game: "pension",
      config: { groups: [1, 2, 3, 4, 5], positions: [null, null, null, null, null, null], games: 2 },
    });
    expect(r.records).toHaveLength(10);
    for (const g of r.records) {
      expect(g.game).toBe("pension");
      expect(g.method).toBe("random");
      if (g.game === "pension") expect(g.numbers.digits).toMatch(/^[0-9]{6}$/);
    }
    const c = await core.generator.generate({
      game: "pension",
      config: { groups: [2], positions: ["0", null, null, null, null, null], games: 1 },
    });
    expect(c.records[0]!.method).toBe("condition");
    const l = await core.generator.generate({ game: "lotto", config: { fixed: [], excluded: [], games: 1 } });
    expect(l.records[0]!.method).toBe("random");
  });

  it("불가능 조건은 EngineError 그대로, 아무것도 저장하지 않는다", async () => {
    const { core, kv } = setup();
    await expect(core.generator.generate({ game: "lotto", config: { fixed: [1], excluded: [1], games: 1 } })).rejects.toBeInstanceOf(EngineError);
    expect(kv.data.size).toBe(0);
  });

  it("이력 저장 중간 실패: saved false, 이미 쓴 줄은 남는다", async () => {
    const { core, kv } = setup();
    kv.fail = (op, _k, n) => op === "set" && n === 3;
    const r = await core.generator.generate({ game: "lotto", config: { fixed: [], excluded: [], games: 5 } });
    expect(r.saved).toBe(false);
    expect(r.records).toHaveLength(5);
    expect(await core.generator.history()).toHaveLength(2);
  });

  it("최근 200개 유지, 저장 번호가 참조하는 오래된 이력(격리 레코드 참조 포함)은 보존", async () => {
    const { core, clock, kv } = setup();
    const first = await core.generator.generate({ game: "lotto", config: { fixed: [], excluded: [], games: 2 } });
    clock.advance(1000);
    const kept = await core.tickets.saveFromGenerated(first.records[0]!.id, { purchase_status: "favorite", round: null });
    // 검증 실패 레코드가 두 번째 줄을 참조 — 원문에서 참조를 찾아 보존한다.
    kv.data.set(recordKey("ticket", "broken"), JSON.stringify({ v: 1, source_number_id: first.records[1]!.id }));
    kv.data.set(recordKey("ticket", "garbage"), "{");
    for (let i = 0; i < 5; i++) {
      clock.advance(1000);
      await core.generator.generate({ game: "lotto", config: { fixed: [], excluded: [], games: 50 } });
    }
    const history = await core.generator.history();
    expect(history).toHaveLength(GENERATED_HISTORY_LIMIT + 2);
    const ids = history.map((g) => g.id);
    expect(ids).toContain(first.records[0]!.id);
    expect(ids).toContain(first.records[1]!.id);
    expect(kept.source_number_id).toBe(first.records[0]!.id);
    expect(history[0]!.created_at >= history[history.length - 1]!.created_at).toBe(true);
  });
});

describe("저장 번호 — 전환·멱등·상한", () => {
  it("추천 번호를 저장해도 구매로 승격되지 않는다(호출자가 고른 상태 유지)", async () => {
    const { core } = setup();
    const g = await core.generator.generate({ game: "lotto", config: { fixed: [], excluded: [], games: 1 } });
    const t = await core.tickets.saveFromGenerated(g.records[0]!.id, { purchase_status: "favorite", round: 1201 });
    expect(t.purchase_status).toBe("favorite");
    expect(t.purchase_date).toBeNull();
    expect(t.ticket_data).toStrictEqual(g.records[0]!.numbers);
    expect(await core.tickets.list({ status: "purchased" })).toHaveLength(0);
    expect(await core.generator.history()).toHaveLength(1);
  });

  it("연금 생성 → 저장: 조·문자열 그대로", async () => {
    const { core } = setup();
    const g = await core.generator.generate({
      game: "pension",
      config: { groups: [4], positions: ["0", "0", "0", null, null, null], games: 1 },
    });
    const t = await core.tickets.saveFromGenerated(g.records[0]!.id, {
      purchase_status: "purchased",
      purchase_date: "2026-11-12",
      round: 291,
    });
    expect(t.ticket_data).toMatchObject({ group_no: 4 });
    expect(t.game === "pension" && t.ticket_data.digits.startsWith("000")).toBe(true);
    await expectCode(core.tickets.saveFromGenerated("nope", { purchase_status: "favorite", round: null }), "NOT_FOUND");
  });

  it("favorite→purchased 허용, purchased→favorite 거부, 같은 상태는 멱등", async () => {
    const { core, clock } = setup();
    const t = await core.tickets.save({ game: "lotto", ticket_data: NUMS, round: 1201, purchase_status: "favorite" });
    expect(await core.tickets.changeStatus(t.id, { purchase_status: "favorite" })).toStrictEqual(t);
    await expectCode(core.tickets.changeStatus(t.id, { purchase_status: "purchased", purchase_date: "2026-02-30" }), "INVALID_INPUT");
    clock.advance(5000);
    const p = await core.tickets.changeStatus(t.id, { purchase_status: "purchased", purchase_date: "2026-11-12", amount_won: 5000 });
    expect(p).toMatchObject({ id: t.id, idempotency_key: t.idempotency_key, purchase_status: "purchased", amount_won: 5000 });
    expect(p.updated_at > t.updated_at).toBe(true);
    await expectCode(core.tickets.changeStatus(t.id, { purchase_status: "favorite" }), "INVALID_TRANSITION");
    const again = await core.tickets.changeStatus(t.id, { purchase_status: "purchased", purchase_date: "2026-11-20" });
    expect(again).toStrictEqual(p);
    await expectCode(core.tickets.changeStatus("missing", { purchase_status: "favorite" }), "NOT_FOUND");
  });

  it("멱등 키: 같은 내용 재요청은 기존 레코드, 다른 내용은 IDEMPOTENCY_CONFLICT", async () => {
    const { core } = setup();
    const key = "33333333-3333-4333-8333-333333333333";
    const input = { game: "lotto", ticket_data: NUMS, round: 1201, purchase_status: "purchased", purchase_date: "2026-11-12", idempotency_key: key } as const;
    const a = await core.tickets.save(input);
    const b = await core.tickets.save(input);
    expect(b).toStrictEqual(a);
    expect(await core.tickets.list()).toHaveLength(1);
    await expectCode(core.tickets.save({ ...input, round: 1202 }), "IDEMPOTENCY_CONFLICT");
    expect(a.id).toBe(key);
  });

  it("같은 키 자리에 격리 레코드가 있으면 덮어쓰지 않고 IDEMPOTENCY_CONFLICT", async () => {
    const { core, kv } = setup();
    const key = "44444444-4444-4444-8444-444444444444";
    kv.data.set(recordKey("ticket", key), "{broken");
    await expectCode(
      core.tickets.save({ game: "lotto", ticket_data: NUMS, round: 1, purchase_status: "favorite", idempotency_key: key }),
      "IDEMPOTENCY_CONFLICT",
    );
    expect(kv.data.get(recordKey("ticket", key))).toBe("{broken");
  });

  it("입력 검증 실패는 INVALID_INPUT(오름차순 아님·연금 숫자·회차 0)", async () => {
    const { core } = setup();
    await expectCode(core.tickets.save({ game: "lotto", ticket_data: { nums: [6, 5, 4, 3, 2, 1] }, round: 1, purchase_status: "favorite" }), "INVALID_INPUT");
    await expectCode(
      core.tickets.save({ game: "pension", ticket_data: { group_no: 1, digits: 719 as unknown as string }, round: 1, purchase_status: "favorite" }),
      "INVALID_INPUT",
    );
    await expectCode(core.tickets.save({ game: "lotto", ticket_data: NUMS, round: 0, purchase_status: "favorite" }), "INVALID_INPUT");
  });

  it("상한 1,000 — 넘으면 LIMIT_EXCEEDED", async () => {
    const { core, kv } = setup();
    const t = await core.tickets.save({ game: "lotto", ticket_data: NUMS, round: null, purchase_status: "favorite" });
    const raw = kv.data.get(recordKey("ticket", t.id))!;
    for (let i = 1; i < TICKET_LIMIT; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      kv.data.set(recordKey("ticket", id), JSON.stringify({ ...JSON.parse(raw), id }));
    }
    await expectCode(core.tickets.save({ game: "lotto", ticket_data: NUMS, round: null, purchase_status: "favorite" }), "LIMIT_EXCEEDED");
  });

  it("목록 필터·삭제", async () => {
    const { core, clock } = setup();
    const a = await core.tickets.save({ game: "lotto", ticket_data: NUMS, round: 1, purchase_status: "favorite" });
    clock.advance(1);
    const b = await core.tickets.save({
      game: "pension",
      ticket_data: { group_no: 2, digits: "012345" },
      round: 1,
      purchase_status: "purchased",
      purchase_date: "2026-11-12",
      amount_won: 1000,
    });
    expect((await core.tickets.list()).map((t) => t.id)).toStrictEqual([b.id, a.id]);
    expect((await core.tickets.list({ game: "lotto" })).map((t) => t.id)).toStrictEqual([a.id]);
    expect((await core.tickets.list({ status: "purchased" })).map((t) => t.id)).toStrictEqual([b.id]);
    await core.tickets.remove(a.id);
    expect(await core.tickets.list()).toHaveLength(1);
    await expectCode(core.tickets.remove(a.id), "NOT_FOUND");
  });
});

describe("구매 회차 기본값(결정 ⑧)", () => {
  it("최신 회차가 8일 이내면 draw_no + 1, 넘으면 null, 데이터 없으면 null", async () => {
    const { core, clock } = setup((url) => (url.includes("draws_lotto") ? { body: [DRAW_LOTTO] } : { body: [] }));
    expect(await core.tickets.defaultRound("lotto")).toBe(DRAW_LOTTO.draw_no + 1); // 11-07 → 11-12(KST) 5일
    expect(await core.tickets.defaultRound("pension")).toBeNull();
    clock.time = Date.parse("2026-11-15T15:00:00.000Z"); // KST 11-16, 9일
    expect(await core.tickets.defaultRound("lotto")).toBeNull();
  });
});

describe("19세 확인(DF-6)", () => {
  it("미확인 → 확인 기록 → 유지, 격리 기록은 미확인으로 보고 덮어쓰지 않는다", async () => {
    const { core, clock, kv } = setup();
    expect(await core.ageGate.isConfirmed()).toBe(false);
    const at = await core.ageGate.confirm();
    expect(at).toBe(new Date(clock.time).toISOString());
    clock.advance(1000);
    expect(await core.ageGate.confirm()).toBe(at);
    expect(await core.ageGate.isConfirmed()).toBe(true);
    expect(JSON.parse(kv.data.get(recordKey("settings", "app"))!)).toStrictEqual({ v: LOCAL_RECORD_VERSION, age_confirmed_at: at });
    const future = JSON.stringify({ v: 99 });
    kv.data.set(recordKey("settings", "app"), future);
    expect(await core.ageGate.isConfirmed()).toBe(false);
    // 격리(미래 버전) 설정은 덮어쓰지 않고 이번 실행 동안만 확인 상태를 유지한다.
    const session = await core.ageGate.confirm();
    expect(await core.ageGate.isConfirmed()).toBe(true);
    expect(await core.ageGate.confirm()).toBe(session);
    expect(kv.data.get(recordKey("settings", "app"))).toBe(future);
  });
});
