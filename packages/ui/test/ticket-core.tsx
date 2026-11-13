// 내 번호 화면(M-07·M-08·M-09·M-12) 테스트용 app-core 가짜: 메모리 저장 번호에 app-core 규칙(멱등 키·구매→즐겨찾기 금지·상태 분리)을 흉내 낸다.
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { NoticeProvider, type HistoryRecord, type SettingsCore, type TicketOutcome, type TicketRecord, type TicketsCore } from "../src";

export const NOW = "2026-11-12T03:00:00.000Z";

let seq = 0;
export function uuid(): string {
  seq++;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
}

export function favorite(partial: Partial<TicketRecord> & Pick<TicketRecord, "game" | "ticket_data">): TicketRecord {
  const id = partial.id ?? uuid();
  return {
    id,
    created_at: NOW,
    updated_at: NOW,
    round: null,
    source_number_id: null,
    idempotency_key: id,
    purchase_status: "favorite",
    purchase_date: null,
    amount_won: null,
    ...partial,
  } as TicketRecord;
}

export function purchased(
  partial: Partial<TicketRecord> & Pick<TicketRecord, "game" | "ticket_data"> & { purchase_date?: string; amount_won?: number | null },
): TicketRecord {
  return favorite({ purchase_date: "2026-11-10", amount_won: 1000, ...partial, purchase_status: "purchased" } as Partial<TicketRecord> &
    Pick<TicketRecord, "game" | "ticket_data">);
}

export function history(partial: { id?: string; game: "lotto"; nums: number[] } | { id?: string; game: "pension"; group_no: number; digits: string }): HistoryRecord {
  const id = partial.id ?? uuid();
  return partial.game === "lotto"
    ? { id, created_at: NOW, game: "lotto", numbers: { nums: partial.nums }, group_no: null }
    : { id, created_at: NOW, game: "pension", numbers: { digits: partial.digits }, group_no: partial.group_no };
}

class CodeError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** 메모리 저장 번호 + 생성 이력. outcomes = checkPurchased 결과를 만드는 함수(기본: 모두 pending). */
export function fakeTicketsCore(init: { tickets?: TicketRecord[]; history?: HistoryRecord[] } = {}) {
  const store = new Map<string, TicketRecord>((init.tickets ?? []).map((t) => [t.id, t]));
  const hist = init.history ?? [];
  let keyNo = 0;
  const judge = vi.fn<(t: TicketRecord) => TicketOutcome>((t) => (t.round === null ? { ticket: t, status: "no_round" } : { ticket: t, status: "pending", stale: false }));
  const tickets = {
    list: vi.fn(async () => [...store.values()]),
    get: vi.fn(async (id: string) => store.get(id) ?? null),
    save: vi.fn<TicketsCore["tickets"]["save"]>(async (input) => {
      const same = store.get(input.idempotency_key);
      if (same) return same;
      const { idempotency_key, ...rest } = input;
      const t = { ...rest, id: idempotency_key, idempotency_key, created_at: NOW, updated_at: NOW, source_number_id: null } as TicketRecord;
      store.set(t.id, t);
      return t;
    }),
    saveFromGenerated: vi.fn<TicketsCore["tickets"]["saveFromGenerated"]>(async (generatedId, input) => {
      const same = store.get(input.idempotency_key);
      if (same) return same;
      const h = hist.find((x) => x.id === generatedId);
      if (!h) throw new CodeError("NOT_FOUND");
      const data =
        h.game === "lotto"
          ? { game: "lotto" as const, ticket_data: { nums: h.numbers.nums } }
          : { game: "pension" as const, ticket_data: { group_no: h.group_no, digits: h.numbers.digits } };
      const t = favorite({ id: input.idempotency_key, ...data, source_number_id: h.id });
      store.set(t.id, t);
      return t;
    }),
    changeStatus: vi.fn<TicketsCore["tickets"]["changeStatus"]>(async (id, input) => {
      const cur = store.get(id);
      if (!cur) throw new CodeError("NOT_FOUND");
      if (cur.purchase_status === "purchased") return cur;
      const next = { ...cur, purchase_status: "purchased", purchase_date: input.purchase_date, amount_won: input.amount_won ?? null, updated_at: "2026-11-12T03:05:00.000Z" } as TicketRecord;
      store.set(id, next);
      return next;
    }),
    purchase: vi.fn<TicketsCore["tickets"]["purchase"]>(async (id, input) => {
      const cur = store.get(id);
      if (!cur) throw new CodeError("NOT_FOUND");
      if (cur.purchase_status === "purchased") return cur;
      const next = { ...cur, purchase_status: "purchased", purchase_date: input.purchase_date, amount_won: input.amount_won ?? null, round: input.round } as TicketRecord;
      store.set(id, next);
      return next;
    }),
    setRound: vi.fn<TicketsCore["tickets"]["setRound"]>(async (id, round) => {
      const cur = store.get(id);
      if (!cur) throw new CodeError("NOT_FOUND");
      const next = { ...cur, round };
      store.set(id, next);
      return next;
    }),
    remove: vi.fn(async (id: string) => {
      if (!store.delete(id)) throw new CodeError("NOT_FOUND");
    }),
    restore: vi.fn(async (t: TicketRecord) => {
      if (!store.has(t.id)) store.set(t.id, t);
      return store.get(t.id)!;
    }),
    newIdempotencyKey: vi.fn(() => `10000000-0000-4000-8000-${String(++keyNo).padStart(12, "0")}`),
    suggestRound: vi.fn<TicketsCore["tickets"]["suggestRound"]>(async (game) => ({ round: game === "lotto" ? 1133 : 291, needs_confirmation: false })),
  };
  const checkPurchased = vi.fn<TicketsCore["checker"]["checkPurchased"]>(async () =>
    [...store.values()].filter((t) => t.purchase_status === "purchased").map((t) => judge(t)),
  );
  const checkTicket = vi.fn<TicketsCore["checker"]["checkTicket"]>(async (id) => {
    const t = store.get(id);
    return t && t.purchase_status === "purchased" ? judge(t) : null;
  });
  const latestDraw = vi.fn(async (game: "lotto" | "pension") => ({
    data: { draw_no: game === "lotto" ? 1132 : 290 },
    fetched_at: NOW,
    stale: false,
  }));
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
  const share = vi.fn<(content: { title?: string; text: string }) => Promise<void>>(async () => {});
  const open = vi.fn<(url: string) => Promise<void>>(async () => {});
  const core = {
    tickets,
    generator: { history: vi.fn(async () => hist) },
    checker: { checkPurchased, checkTicket },
    reader: { latestDraw },
    adapters: { clipboard: { writeText }, share: { share }, openExternal: { open }, clock: { now: () => new Date(NOW) } },
  } as unknown as TicketsCore & { adapters: { clock: { now(): Date } } };
  return { core, store, tickets, judge, checkPurchased, checkTicket, latestDraw, writeText, share, open };
}

export function fakeSettingsCore(summary = { tickets: 2, favorites: 1, purchased: 1, generated: 3 }) {
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
  const share = vi.fn<(content: { title?: string; text: string }) => Promise<void>>(async () => {});
  const clearAll = vi.fn(async () => 5);
  const setTheme = vi.fn(async (t: "system" | "light" | "dark") => t);
  const core: SettingsCore = {
    ageGate: { confirmedAt: vi.fn(async () => NOW) },
    theme: { get: vi.fn(async () => "system" as const), set: setTheme },
    data: {
      summary: vi.fn(async () => summary),
      exportJson: vi.fn(async () => JSON.stringify({ tickets: [{ ticket_data: { group_no: 1, digits: "000719" } }] }, null, 2)),
      clearAll,
    },
    adapters: { clipboard: { writeText }, share: { share } },
  };
  return { core, writeText, share, clearAll, setTheme };
}

export function renderWithNotice(ui: ReactElement) {
  return render(<NoticeProvider>{ui}</NoticeProvider>);
}
