// 공용 판정 벡터 — 같은 JSON을 scripts/gen-parity-sql.mjs가 pgTAP(supabase/tests/validation_parity_test.sql)로 만들어 DB 정본에 돌린다.
// 여기서는 Zod 쪽 판정이 벡터의 valid와 같은지 본다. 양쪽이 통과하면 Zod와 DB CHECK가 같은 판정이다(task-011 결정 ⑤).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { GameType } from "@lotto-lab/types";
import { NUMBERS_SCHEMAS, TICKET_SCHEMAS, TicketCreateInputSchema } from "../src/index.ts";

type DataCase = { name: string; game: GameType; data: unknown; valid: boolean };
/** valid 하나 또는 의도적 차이가 있을 때 app(Zod)·db를 따로 적는다. 여기서는 앱 쪽만 본다. */
type StatusCase = { name: string; fields: Record<string, unknown>; valid?: boolean; app?: boolean; db?: boolean; sqlstate?: string };
const appExpect = (c: StatusCase) => c.app ?? c.valid;

const dir = path.join(import.meta.dirname, "vectors");
const load = <T>(name: string): T => JSON.parse(readFileSync(path.join(dir, name), "utf8")) as T;
const numbers = load<{ cases: DataCase[] }>("numbers.json");
const tickets = load<{ cases: DataCase[] }>("tickets.json");
const status = load<{ base: Record<string, unknown>; cases: StatusCase[] }>("ticket-status.json");

describe("벡터 파일", () => {
  it("이름이 파일 안에서 겹치지 않는다(pgTAP 설명으로 구분)", () => {
    for (const { cases } of [numbers, tickets, status]) {
      const names = cases.map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("valid·invalid 양쪽 사례가 모두 있다", () => {
    for (const { cases } of [numbers, tickets]) {
      expect(cases.some((c) => c.valid)).toBe(true);
      expect(cases.some((c) => !c.valid)).toBe(true);
    }
    expect(status.cases.some((c) => appExpect(c))).toBe(true);
    expect(status.cases.some((c) => !appExpect(c))).toBe(true);
  });

  it("상태 벡터는 valid 하나, 또는 서로 다른 app·db 쌍만 쓴다", () => {
    for (const c of status.cases) {
      const split = c.app !== undefined || c.db !== undefined;
      if (split) {
        expect(c.valid, c.name).toBeUndefined();
        expect(typeof c.app === "boolean" && typeof c.db === "boolean" && c.app !== c.db, c.name).toBe(true);
      } else {
        expect(typeof c.valid, c.name).toBe("boolean");
      }
    }
  });

  it("생성된 pgTAP 파일이 벡터와 같다(gen-parity-sql --check)", () => {
    const root = path.join(import.meta.dirname, "..", "..", "..");
    expect(() =>
      execFileSync(process.execPath, [path.join(root, "scripts", "gen-parity-sql.mjs"), "--check"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});

describe.each([
  ["numbers (valid_numbers)", numbers.cases, NUMBERS_SCHEMAS],
  ["ticket (valid_ticket)", tickets.cases, TICKET_SCHEMAS],
] as const)("%s", (_label, cases, schemas) => {
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const result = schemas[c.game].safeParse(c.data);
    expect(result.success).toBe(c.valid);
    // 통과하면 값이 바뀌지 않는다(정렬·숫자 변환 없음 — 앞자리 0 보존).
    if (result.success) expect(result.data).toStrictEqual(c.data);
  });
});

describe("ticket-status (saved_tickets 상태-열 CHECK)", () => {
  it.each(status.cases.map((c, i) => [c.name, c, i] as const))("%s", (_name, c, i) => {
    const input = {
      ...status.base,
      ...c.fields,
      idempotency_key: `00000000-0000-4000-8000-${(0xd0000 + i).toString(16).padStart(12, "0")}`,
    };
    expect(TicketCreateInputSchema.safeParse(input).success).toBe(appExpect(c));
  });
});
