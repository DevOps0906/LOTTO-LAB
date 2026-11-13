// 저장 계층(결정 ①②③): 쓰기 직렬화·동시 쓰기 유실 없음·부분 실패 보존·격리 레코드 미삭제·지연 마이그레이션.
import { describe, expect, it } from "vitest";
import { LocalTicketSchema } from "@lotto-lab/validation";
import { AppCoreError, LocalStore, createAppCore, recordKey } from "../src/index.ts";
import { uuidV4 } from "../src/storage.ts";
import { CONFIG, MockClock, MockKv, adapters, mockFetch, xorshift } from "./helpers.ts";

const offline = mockFetch(() => new Error("offline"));
const lotto = (n: number) => ({ nums: [n, n + 1, n + 2, n + 3, n + 4, n + 5] });

function setup(kv = new MockKv()) {
  const clock = new MockClock();
  const core = createAppCore(adapters(kv, clock, offline), CONFIG);
  return { kv, clock, core };
}

const QUARANTINE = {
  [recordKey("ticket", "broken-json")]: "{not json",
  [recordKey("ticket", "future")]: JSON.stringify({ v: 2, id: "future", whatever: true }),
  [recordKey("ticket", "invalid")]: JSON.stringify({ v: 1, id: "invalid", game: "lotto", ticket_data: { nums: [9, 1] } }),
  [recordKey("ticket", "no-version")]: JSON.stringify({ id: "no-version" }),
  [recordKey("ticket", "array")]: JSON.stringify([1, 2]),
};

describe("쓰기 큐 — 동시성", () => {
  it("동시 저장 40건이 모두 남고 KV 쓰기는 겹치지 않는다", async () => {
    const { kv, core } = setup();
    const saves = Array.from({ length: 40 }, (_, i) =>
      core.tickets.save({ game: "lotto", ticket_data: lotto((i % 40) + 1), round: 1201, purchase_status: "favorite" }),
    );
    const saved = await Promise.all(saves);
    expect(new Set(saved.map((t) => t.id)).size).toBe(40);
    expect(await core.tickets.list()).toHaveLength(40);
    expect(kv.maxActiveWrites).toBe(1);
  });

  it("저장·전환·생성이 섞여 겹쳐도 유실 없음", async () => {
    const { core } = setup();
    const first = await core.tickets.save({ game: "lotto", ticket_data: lotto(1), round: 1201, purchase_status: "favorite" });
    const ops = await Promise.all([
      core.tickets.changeStatus(first.id, { purchase_status: "purchased", purchase_date: "2026-11-12" }),
      core.tickets.save({ game: "lotto", ticket_data: lotto(2), round: 1201, purchase_status: "favorite" }),
      core.generator.generate({ game: "lotto", config: { fixed: [], excluded: [], games: 5 } }),
      core.tickets.save({ game: "pension", ticket_data: { group_no: 1, digits: "000001" }, round: 290, purchase_status: "favorite" }),
      core.tickets.changeStatus(first.id, { purchase_status: "purchased", purchase_date: "2026-11-13" }),
    ]);
    expect(ops).toHaveLength(5);
    const tickets = await core.tickets.list();
    expect(tickets).toHaveLength(3);
    expect(tickets.find((t) => t.id === first.id)?.purchase_date).toBe("2026-11-12"); // 두 번째 전환은 멱등
    expect(await core.generator.history()).toHaveLength(5);
  });

  it("중간 실패: 실패한 작업만 거부되고 앞뒤 작업·기존 데이터는 남는다", async () => {
    const { kv, core } = setup();
    const before = await core.tickets.save({ game: "lotto", ticket_data: lotto(1), round: 1, purchase_status: "favorite" });
    const failAt = kv.setCount + 2;
    kv.fail = (op, _key, n) => op === "set" && n === failAt;
    const results = await Promise.allSettled(
      [2, 3, 4].map((n) => core.tickets.save({ game: "lotto", ticket_data: lotto(n), round: 1, purchase_status: "favorite" })),
    );
    expect(results.map((r) => r.status)).toStrictEqual(["fulfilled", "rejected", "fulfilled"]);
    const reason = (results[1] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(AppCoreError);
    expect((reason as AppCoreError).code).toBe("STORAGE_FAILED");
    const ids = (await core.tickets.list()).map((t) => t.id);
    expect(ids).toHaveLength(3);
    expect(ids).toContain(before.id);
  });

  it("delete·flush 실패도 STORAGE_FAILED이고 레코드는 남는다", async () => {
    const { kv, core } = setup();
    const t = await core.tickets.save({ game: "lotto", ticket_data: lotto(1), round: 1, purchase_status: "favorite" });
    kv.fail = (op) => op === "delete";
    await expect(core.tickets.remove(t.id)).rejects.toMatchObject({ code: "STORAGE_FAILED" });
    kv.fail = (op) => op === "flush";
    await expect(
      core.tickets.save({ game: "lotto", ticket_data: lotto(2), round: 1, purchase_status: "favorite" }),
    ).rejects.toMatchObject({ code: "STORAGE_FAILED" });
    kv.fail = () => false;
    expect((await core.tickets.list()).map((x) => x.id)).toContain(t.id);
  });
});

describe("격리 — 읽기에서 건너뛰고 절대 다시 쓰거나 지우지 않는다", () => {
  it("파싱 실패·미래 버전·검증 실패·버전 없음 레코드", async () => {
    const kv = new MockKv();
    for (const [k, v] of Object.entries(QUARANTINE)) kv.data.set(k, v);
    const { core } = setup(kv);
    const t = await core.tickets.save({ game: "lotto", ticket_data: lotto(1), round: 1, purchase_status: "favorite" });
    await core.tickets.changeStatus(t.id, { purchase_status: "purchased", purchase_date: "2026-11-12" });
    await core.generator.generate({ game: "lotto", config: { fixed: [], excluded: [], games: 3 } });
    await core.tickets.remove(t.id);
    expect(await core.tickets.list()).toHaveLength(0);
    for (const [k, v] of Object.entries(QUARANTINE)) expect(kv.data.get(k)).toBe(v);
    await expect(core.tickets.remove("future")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(kv.data.get(recordKey("ticket", "future"))).toBe(QUARANTINE[recordKey("ticket", "future")]);
  });
});

describe("지연 마이그레이션(레코드 v)", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  const v0 = {
    v: 0,
    id: ID,
    created_at: "2026-11-01T00:00:00.000Z",
    round: 1199,
    game: "lotto",
    nums: [1, 2, 3, 4, 5, 6],
    status: "favorite",
    key: "22222222-2222-4222-8222-222222222222",
  };
  const toV1 = (r: Record<string, unknown>) => ({
    v: 1,
    id: r.id,
    created_at: r.created_at,
    updated_at: r.created_at,
    round: r.round,
    source_number_id: null,
    idempotency_key: r.key,
    game: r.game,
    ticket_data: { nums: r.nums },
    purchase_status: r.status,
    purchase_date: null,
    amount_won: null,
  });

  it("변환 검증 성공 후에만 원본 키를 덮어쓴다", async () => {
    const kv = new MockKv();
    const key = recordKey("ticket", ID);
    kv.data.set(key, JSON.stringify(v0));
    const store = new LocalStore(kv, { ticket: { 0: toV1 } });
    const list = await store.run(() => store.scan("ticket", LocalTicketSchema));
    expect(list).toHaveLength(1);
    expect(list[0]!.value.ticket_data).toStrictEqual({ nums: [1, 2, 3, 4, 5, 6] });
    expect(JSON.parse(kv.data.get(key)!).v).toBe(1);
  });

  it("변환 결과가 검증 실패·변환 예외·단계 없음이면 원본 보존", async () => {
    for (const migrations of [
      { ticket: { 0: (r: Record<string, unknown>) => ({ ...toV1(r), ticket_data: { nums: [1] } }) } },
      {
        ticket: {
          0: () => {
            throw new Error("x");
          },
        },
      },
      {},
    ]) {
      const kv = new MockKv({ maxDelayMs: 0 });
      const key = recordKey("ticket", ID);
      const raw = JSON.stringify(v0);
      kv.data.set(key, raw);
      const store = new LocalStore(kv, migrations);
      expect(await store.run(() => store.scan("ticket", LocalTicketSchema))).toHaveLength(0);
      expect(kv.data.get(key)).toBe(raw);
    }
  });

  it("재기록 실패해도 변환본을 돌려주고 원본은 남는다", async () => {
    const kv = new MockKv({ maxDelayMs: 0 });
    const key = recordKey("ticket", ID);
    const raw = JSON.stringify(v0);
    kv.data.set(key, raw);
    kv.fail = (op) => op === "set";
    const store = new LocalStore(kv, { ticket: { 0: toV1 } });
    expect(await store.run(() => store.get("ticket", ID, LocalTicketSchema))).not.toBeNull();
    expect(kv.data.get(key)).toBe(raw);
  });
});

describe("uuidV4", () => {
  it("RFC 4122 v4 형식", () => {
    const rand = xorshift(7);
    const random = { fill: (b: Uint32Array) => b.forEach((_, i) => (b[i] = rand())) };
    for (let i = 0; i < 50; i++) expect(uuidV4(random)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
