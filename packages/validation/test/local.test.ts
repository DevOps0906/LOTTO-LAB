// 로컬 레코드 스키마(task-016 결정 ④): round NULL 허용, 상태별 열 조합, 추가 키 금지, 미래 버전 거부, 연금 문자열 보존.
import { describe, expect, it } from "vitest";
import { LOCAL_RECORD_VERSION, LocalGeneratedSchema, LocalSettingsSchema, LocalTicketSchema } from "../src/index.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const AT = "2026-11-12T00:00:00.000Z";

const favorite = {
  v: LOCAL_RECORD_VERSION,
  id: ID,
  created_at: AT,
  updated_at: AT,
  round: 1200,
  source_number_id: null,
  idempotency_key: KEY,
  game: "lotto",
  ticket_data: { nums: [1, 2, 3, 4, 5, 6] },
  purchase_status: "favorite",
  purchase_date: null,
  amount_won: null,
};
const purchased = { ...favorite, purchase_status: "purchased", purchase_date: "2026-11-12", amount_won: 5000 };

describe("LocalTicketSchema", () => {
  it("favorite·purchased 유효", () => {
    expect(LocalTicketSchema.safeParse(favorite).success).toBe(true);
    expect(LocalTicketSchema.safeParse(purchased).success).toBe(true);
    expect(LocalTicketSchema.safeParse({ ...purchased, amount_won: null }).success).toBe(true);
  });

  it("round NULL 허용, 0·소수는 거부", () => {
    expect(LocalTicketSchema.safeParse({ ...favorite, round: null }).success).toBe(true);
    expect(LocalTicketSchema.safeParse({ ...favorite, round: 0 }).success).toBe(false);
    expect(LocalTicketSchema.safeParse({ ...favorite, round: 1.5 }).success).toBe(false);
  });

  it("상태별 열 조합: favorite은 날짜·금액 null, purchased는 날짜 필수", () => {
    expect(LocalTicketSchema.safeParse({ ...favorite, purchase_date: "2026-11-12" }).success).toBe(false);
    expect(LocalTicketSchema.safeParse({ ...purchased, purchase_date: null }).success).toBe(false);
    expect(LocalTicketSchema.safeParse({ ...purchased, amount_won: -1 }).success).toBe(false);
  });

  it("추가 키·미래 버전·잘못된 id 거부", () => {
    expect(LocalTicketSchema.safeParse({ ...favorite, extra: 1 }).success).toBe(false);
    expect(LocalTicketSchema.safeParse({ ...favorite, v: LOCAL_RECORD_VERSION + 1 }).success).toBe(false);
    expect(LocalTicketSchema.safeParse({ ...favorite, id: "x" }).success).toBe(false);
  });

  it("연금: 앞자리 0 문자열 보존, 숫자 거부", () => {
    const p = { ...favorite, game: "pension", ticket_data: { group_no: 1, digits: "000719" } };
    const parsed = LocalTicketSchema.parse(p);
    expect(parsed.ticket_data).toStrictEqual({ group_no: 1, digits: "000719" });
    expect(LocalTicketSchema.safeParse({ ...p, ticket_data: { group_no: 1, digits: 719 } }).success).toBe(false);
    expect(LocalTicketSchema.safeParse({ ...p, ticket_data: { nums: [1, 2, 3, 4, 5, 6] } }).success).toBe(false);
  });
});

describe("LocalGeneratedSchema", () => {
  const lotto = {
    v: LOCAL_RECORD_VERSION,
    id: ID,
    created_at: AT,
    batch_id: KEY,
    line_no: 1,
    engine_version: "lotto@1",
    method: "random",
    game: "lotto",
    numbers: { nums: [1, 2, 3, 4, 5, 6] },
    group_no: null,
  };

  it("로또·연금 유효", () => {
    expect(LocalGeneratedSchema.safeParse(lotto).success).toBe(true);
    const pension = { ...lotto, game: "pension", numbers: { digits: "012345" }, group_no: 3, engine_version: "pension@1" };
    expect(LocalGeneratedSchema.safeParse(pension).success).toBe(true);
    expect(LocalGeneratedSchema.safeParse({ ...pension, group_no: null }).success).toBe(false);
  });

  it("구매 상태 열이 섞이면 거부(상태 분리)", () => {
    expect(LocalGeneratedSchema.safeParse({ ...lotto, purchase_status: "purchased" }).success).toBe(false);
    expect(LocalGeneratedSchema.safeParse({ ...lotto, method: "hot" }).success).toBe(false);
    expect(LocalGeneratedSchema.safeParse({ ...lotto, line_no: 51 }).success).toBe(false);
  });
});

describe("LocalSettingsSchema", () => {
  it("19세 확인 시각 또는 null", () => {
    expect(LocalSettingsSchema.safeParse({ v: 1, age_confirmed_at: AT }).success).toBe(true);
    expect(LocalSettingsSchema.safeParse({ v: 1, age_confirmed_at: null }).success).toBe(true);
    expect(LocalSettingsSchema.safeParse({ v: 1, age_confirmed_at: "2026-11-12" }).success).toBe(false);
  });
});
