// 저장 번호(favorite·purchased) 로컬 관리(task-016 결정 ②⑧⑩). 생성 이력(generated)과 섞지 않는다 —
// 추천 번호는 사용자가 명시적으로 저장할 때만 ticket이 되고, 그때도 구매로 간주하지 않는다(상태는 호출자가 고른다).
import { kstToday } from "@lotto-lab/lottery-core";
import type { GameType, LottoTicket, PensionTicket, TicketPurchaseInput } from "@lotto-lab/types";
import {
  LocalGeneratedSchema,
  LocalTicketSchema,
  TicketPurchaseInputSchema,
  isAllowedTransition,
  type LocalGenerated,
  type LocalTicket,
} from "@lotto-lab/validation";
import type { Clock, RandomBytes } from "./adapters.ts";
import { AppCoreError } from "./errors.ts";
import type { PublicReader } from "./public-read.ts";
import { type LocalStore, uuidV4 } from "./storage.ts";

/** 저장 번호 상한(결정 ⑩). */
export const TICKET_LIMIT = 1000;
/** 최신 회차 캐시가 이 일수보다 오래되면 구매 회차 기본값을 주지 않는다(결정 ⑧). */
export const ROUND_DEFAULT_MAX_AGE_DAYS = 8;

type StatusPart = { purchase_status: "favorite" } | { purchase_status: "purchased"; purchase_date: string; amount_won?: number | null };
type GamePart = { game: "lotto"; ticket_data: LottoTicket } | { game: "pension"; ticket_data: PensionTicket };

/** 직접 입력 저장. round null = 회차 미확인(판정 대상 아님). idempotency_key를 주면 같은 키 재요청은 기존 레코드를 돌려준다. */
export type SaveTicketInput = GamePart & StatusPart & { round: number | null; idempotency_key?: string };
/** round: 제안 회차(최신 회차가 없으면 null). needs_confirmation이면 사용자가 회차를 확인·입력해야 한다. */
export type RoundSuggestion = { round: number | null; needs_confirmation: boolean };

/** 새 멱등 키(uuid v4) — TicketService.newIdempotencyKey와 같다. */
export function newIdempotencyKey(random: RandomBytes): string {
  return uuidV4(random);
}

export type SaveFromGeneratedInput = StatusPart & { round: number | null; idempotency_key?: string };

export class TicketService {
  private readonly store: LocalStore;
  private readonly clock: Clock;
  private readonly random: RandomBytes;
  private readonly reader: PublicReader;

  constructor(store: LocalStore, clock: Clock, random: RandomBytes, reader: PublicReader) {
    this.store = store;
    this.clock = clock;
    this.random = random;
    this.reader = reader;
  }

  /** 최신순 목록(격리 레코드 제외). */
  list(filter: { game?: GameType; status?: LocalTicket["purchase_status"] } = {}): Promise<LocalTicket[]> {
    return this.store.run(async () => {
      const entries = await this.store.scan("ticket", LocalTicketSchema);
      return entries
        .map((e) => e.value)
        .filter((t) => (filter.game === undefined || t.game === filter.game) && (filter.status === undefined || t.purchase_status === filter.status))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
    });
  }

  save(input: SaveTicketInput): Promise<LocalTicket> {
    return this.store.run(() => this.insert(input, null));
  }

  /** 생성 이력 한 줄을 저장 번호로(source_number_id 연결). 생성 이력 레코드는 그대로 둔다. */
  saveFromGenerated(generatedId: string, input: SaveFromGeneratedInput): Promise<LocalTicket> {
    return this.store.run(async () => {
      const g = await this.store.get("generated", generatedId, LocalGeneratedSchema);
      if (!g) throw new AppCoreError("NOT_FOUND", "generated");
      return this.insert({ ...input, ...ticketOf(g) }, g.id);
    });
  }

  /** 상태 전환(id 기준 멱등). 같은 상태면 그대로 돌려준다. purchased→favorite은 INVALID_TRANSITION(R19). */
  changeStatus(id: string, input: { purchase_status: "favorite" } | TicketPurchaseInput): Promise<LocalTicket> {
    return this.store.run(async () => {
      const current = await this.store.get("ticket", id, LocalTicketSchema);
      if (!current) throw new AppCoreError("NOT_FOUND", "ticket");
      const to = input.purchase_status;
      if (!isAllowedTransition(current.purchase_status, to)) throw new AppCoreError("INVALID_TRANSITION");
      if (current.purchase_status === to) return current;
      const purchase = TicketPurchaseInputSchema.safeParse(input);
      if (!purchase.success) throw new AppCoreError("INVALID_INPUT", "purchase");
      const next = this.parse({
        ...current,
        purchase_status: "purchased",
        purchase_date: purchase.data.purchase_date,
        amount_won: purchase.data.amount_won ?? null,
        updated_at: this.clock.now().toISOString(),
      });
      await this.store.put("ticket", id, next);
      return next;
    });
  }

  /**
   * 즐겨찾기 → 구매 기록 전환(M-09)을 한 번의 레코드 쓰기로: 전환 검증(isAllowedTransition) + 상태·구매일·금액·회차 갱신.
   * 이미 purchased면 쓰지 않고 그대로 돌려준다(id 기준 멱등 — 같은 id 재호출 = 같은 결과). 없으면 NOT_FOUND, 입력 오류는 INVALID_INPUT.
   */
  purchase(id: string, input: { round: number | null; purchase_date: string; amount_won?: number }): Promise<LocalTicket> {
    return this.store.run(async () => {
      const current = await this.store.get("ticket", id, LocalTicketSchema);
      if (!current) throw new AppCoreError("NOT_FOUND", "ticket");
      if (!isAllowedTransition(current.purchase_status, "purchased")) throw new AppCoreError("INVALID_TRANSITION");
      if (current.purchase_status === "purchased") return current;
      const { round, ...rest } = input;
      const purchase = TicketPurchaseInputSchema.safeParse({ purchase_status: "purchased", ...rest });
      if (!purchase.success) throw new AppCoreError("INVALID_INPUT", "purchase");
      const next = this.parse({
        ...current,
        purchase_status: "purchased",
        purchase_date: purchase.data.purchase_date,
        amount_won: purchase.data.amount_won ?? null,
        round,
        updated_at: this.clock.now().toISOString(),
      });
      await this.store.put("ticket", id, next);
      return next;
    });
  }

  /** 저장 번호 1개(없거나 격리 대상이면 null). */
  get(id: string): Promise<LocalTicket | null> {
    return this.store.run(() => this.store.get("ticket", id, LocalTicketSchema));
  }

  /**
   * 회차 입력·수정(결정 ⑧ — 회차 미입력으로 저장한 구매 기록을 나중에 확인). 상태·번호는 바꾸지 않는다.
   * 같은 회차면 그대로 돌려준다(id 기준 멱등). round null = 회차 미확인으로 되돌림.
   */
  setRound(id: string, round: number | null): Promise<LocalTicket> {
    return this.store.run(async () => {
      const current = await this.store.get("ticket", id, LocalTicketSchema);
      if (!current) throw new AppCoreError("NOT_FOUND", "ticket");
      if (current.round === round) return current;
      const next = this.parse({ ...current, round, updated_at: this.clock.now().toISOString() });
      await this.store.put("ticket", id, next);
      return next;
    });
  }

  /**
   * 제거 실행 취소: remove로 지운 레코드를 그대로(id·created_at·상태 유지) 되돌린다.
   * 같은 id 자리에 이미 키가 있으면(복원됨·격리 레코드) 덮어쓰지 않고 기존 유효 레코드를 돌려준다.
   */
  restore(ticket: LocalTicket): Promise<LocalTicket> {
    return this.store.run(async () => {
      const record = this.parse(ticket);
      const same = await this.store.get("ticket", record.id, LocalTicketSchema);
      if (same) return same;
      if (await this.store.exists("ticket", record.id)) throw new AppCoreError("IDEMPOTENCY_CONFLICT");
      if ((await this.store.count("ticket")) >= TICKET_LIMIT) throw new AppCoreError("LIMIT_EXCEEDED");
      await this.store.put("ticket", record.id, record);
      return record;
    });
  }

  /** 본인 기록 삭제(유효 레코드만 — 격리 레코드는 보존). */
  remove(id: string): Promise<void> {
    return this.store.run(async () => {
      const current = await this.store.get("ticket", id, LocalTicketSchema);
      if (!current) throw new AppCoreError("NOT_FOUND", "ticket");
      await this.store.remove("ticket", id);
    });
  }

  /**
   * 새 멱등 키(uuid v4). 화면(저장·구매 등록 폼) 진입 시 한 번 발급해 save/saveFromGenerated의 idempotency_key로 넘기면
   * 두 번 누름·재시도가 같은 레코드로 수렴한다(결정 ②, R18). 저장된 레코드의 id도 이 값이 된다.
   */
  newIdempotencyKey(): string {
    return newIdempotencyKey(this.random);
  }

  /**
   * 구매 회차 제안(결정 ⑧): 최신 draw_no + max(1, ceil(경과일/7)) — 경과일 = KST 오늘 − 최신 draw_date.
   * 최신 회차가 없거나 경과 8일 초과면 needs_confirmation = true(사용자가 회차를 직접 확인·입력, 회차 없이 저장도 허용).
   */
  async suggestRound(game: GameType): Promise<RoundSuggestion> {
    const latest = await this.reader.latestDraw(game);
    if (!latest.data) return { round: null, needs_confirmation: true };
    const today = Date.parse(kstToday(this.clock.now()));
    const days = Math.round((today - Date.parse(latest.data.draw_date)) / 86_400_000);
    const round = latest.data.draw_no + Math.max(1, Math.ceil(days / 7));
    return { round, needs_confirmation: days > ROUND_DEFAULT_MAX_AGE_DAYS };
  }

  /** 구매 회차 기본값: suggestRound가 확인 필요면 null, 아니면 제안 회차. */
  async defaultRound(game: GameType): Promise<number | null> {
    const s = await this.suggestRound(game);
    return s.needs_confirmation ? null : s.round;
  }

  /** 레코드 id = 멱등 키(결정 ②) — 같은 키 재요청은 키 1개 조회로 찾는다. 상한은 키 개수(격리 포함)로 센다. */
  private async insert(input: SaveTicketInput, sourceNumberId: string | null): Promise<LocalTicket> {
    if (input.idempotency_key !== undefined) {
      const same = await this.store.get("ticket", input.idempotency_key, LocalTicketSchema);
      if (same) {
        if (contentKey(same) !== contentKey(this.build(input, sourceNumberId, same))) throw new AppCoreError("IDEMPOTENCY_CONFLICT");
        return same;
      }
      // 같은 키 자리에 격리 레코드가 있으면 덮어쓰지 않는다(결정 ③).
      if (await this.store.exists("ticket", input.idempotency_key)) throw new AppCoreError("IDEMPOTENCY_CONFLICT");
    }
    if ((await this.store.count("ticket")) >= TICKET_LIMIT) throw new AppCoreError("LIMIT_EXCEEDED");
    const record = this.build(input, sourceNumberId);
    await this.store.put("ticket", record.id, record);
    return record;
  }

  private build(input: SaveTicketInput, sourceNumberId: string | null, reuse?: LocalTicket): LocalTicket {
    const now = this.clock.now().toISOString();
    const id = input.idempotency_key ?? uuidV4(this.random);
    const status =
      input.purchase_status === "purchased"
        ? { purchase_status: "purchased", purchase_date: input.purchase_date, amount_won: input.amount_won ?? null }
        : { purchase_status: "favorite", purchase_date: null, amount_won: null };
    return this.parse({
      v: 1,
      id,
      created_at: reuse?.created_at ?? now,
      updated_at: reuse?.updated_at ?? now,
      round: input.round,
      source_number_id: sourceNumberId,
      idempotency_key: id,
      game: input.game,
      ticket_data: input.ticket_data,
      ...status,
    });
  }

  private parse(record: unknown): LocalTicket {
    const parsed = LocalTicketSchema.safeParse(record);
    if (!parsed.success) throw new AppCoreError("INVALID_INPUT", "ticket");
    return parsed.data;
  }
}

function ticketOf(g: LocalGenerated): GamePart {
  return g.game === "lotto"
    ? { game: "lotto", ticket_data: { nums: [...g.numbers.nums] } }
    : { game: "pension", ticket_data: { group_no: g.group_no, digits: g.numbers.digits } };
}

/** 멱등 비교 대상 내용(번호·회차·상태 열·출처). */
function contentKey(t: LocalTicket): string {
  return JSON.stringify([t.game, t.ticket_data, t.round, t.purchase_status, t.purchase_date, t.amount_won, t.source_number_id]);
}
