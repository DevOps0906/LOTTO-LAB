// 저장 티켓 입력 DTO — A-07(POST /v1/tickets)·A-14(PATCH /v1/tickets/{id}).
// purchase_status 판별: favorite은 날짜·금액 없음, purchased는 날짜 필수·금액 선택(DB saved_tickets_status_cols_chk).
import type { LottoTicket, PensionTicket } from "./numbers.ts";

type Flatten<T> = { [K in keyof T]: T[K] };

type TicketCommon = {
  /** 대상 회차(정수 ≥1). */
  round: number;
  /** 생성 이력에서 저장한 경우의 generated_numbers.id(uuid). */
  source_number_id?: string;
  /** 멱등 키(uuid, R18). */
  idempotency_key: string;
};
type LottoPart = { game: "lotto"; ticket_data: LottoTicket };
type PensionPart = { game: "pension"; ticket_data: PensionTicket };
type FavoritePart = { purchase_status: "favorite" };

/** A-14 본문: favorite→purchased 전환(역전환 금지, R19). purchase_date는 `YYYY-MM-DD`, amount_won은 구매 금액 정수 원(≥0). */
export type TicketPurchaseInput = { purchase_status: "purchased"; purchase_date: string; amount_won?: number };

/** A-07 본문: 게임(번호 형식) × 구매 상태(열 조합). */
export type TicketCreateInput =
  | Flatten<TicketCommon & LottoPart & FavoritePart>
  | Flatten<TicketCommon & LottoPart & TicketPurchaseInput>
  | Flatten<TicketCommon & PensionPart & FavoritePart>
  | Flatten<TicketCommon & PensionPart & TicketPurchaseInput>;
