// 당첨 판정(DF-5 P0): purchased 저장 번호 × 공개 회차(캐시 우선) → lottery-core judge.
// 결과는 저장하지 않고 표시 시점에 계산한다(결정 ⑨ — 회차 정정이 자동 반영). favorite·생성 이력은 대상이 아니다.
import { judgeLotto, judgePension, type JudgeResult } from "@lotto-lab/lottery-core";
import type { DrawLotto, DrawPension, GameType } from "@lotto-lab/types";
import type { LocalTicket } from "@lotto-lab/validation";
import type { PublicReader, ReadError, ReadOptions, ReadResult } from "./public-read.ts";
import type { TicketService } from "./ticket-service.ts";

/**
 * no_round: 회차 미입력(round null). pending: 해당 회차 결과가 아직 없음(미수집·오프라인에 캐시 없음).
 * checked: 판정 완료 — 화면은 출처(source_url)·검증 시각(source_verified_at)·동기화 시각(fetched_at)을 함께 표시한다.
 */
export type CheckOutcome =
  | { ticket: LocalTicket; status: "no_round" }
  | { ticket: LocalTicket; status: "pending"; stale: boolean; error?: ReadError }
  | {
      ticket: LocalTicket;
      status: "checked";
      draw_no: number;
      result: JudgeResult;
      source_url: string;
      source_verified_at: string;
      fetched_at: string | null;
      stale: boolean;
    };

export class CheckService {
  private readonly tickets: TicketService;
  private readonly reader: PublicReader;

  constructor(tickets: TicketService, reader: PublicReader) {
    this.tickets = tickets;
    this.reader = reader;
  }

  async checkPurchased(game?: GameType, options: ReadOptions = {}): Promise<CheckOutcome[]> {
    const purchased = await this.tickets.list({ game, status: "purchased" });
    const out: CheckOutcome[] = [];
    // 같은 회차는 한 번만 읽는다(force여도 회차별 요청 1회).
    const lottoDraws = new Map<number, Promise<ReadResult<DrawLotto>>>();
    const pensionDraws = new Map<number, Promise<ReadResult<DrawPension>>>();
    const lottoDraw = (round: number) => memo(lottoDraws, round, () => this.reader.drawByRound("lotto", round, options));
    const pensionDraw = (round: number) => memo(pensionDraws, round, () => this.reader.drawByRound("pension", round, options));
    for (const ticket of purchased) {
      if (ticket.round === null) {
        out.push({ ticket, status: "no_round" });
        continue;
      }
      const round = ticket.round;
      out.push(
        ticket.game === "lotto"
          ? outcomeOf(ticket, await lottoDraw(round), (d) => judgeLotto(ticket.ticket_data, d))
          : outcomeOf(ticket, await pensionDraw(round), (d) => judgePension(ticket.ticket_data, d)),
      );
    }
    return out;
  }
}

type DrawProvenance = { draw_no: number; source_url: string; source_verified_at: string };

function outcomeOf<D extends DrawProvenance>(ticket: LocalTicket, read: ReadResult<D>, judge: (draw: D) => JudgeResult): CheckOutcome {
  const draw = read.data;
  if (!draw) return { ticket, status: "pending", stale: read.stale, ...(read.error ? { error: read.error } : {}) };
  return {
    ticket,
    status: "checked",
    draw_no: draw.draw_no,
    result: judge(draw),
    source_url: draw.source_url,
    source_verified_at: draw.source_verified_at,
    fetched_at: read.fetched_at,
    stale: read.stale,
  };
}

function memo<K, V>(cache: Map<K, V>, key: K, load: () => V): V {
  if (!cache.has(key)) cache.set(key, load());
  return cache.get(key)!;
}
