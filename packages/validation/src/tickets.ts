// 저장 티켓 입력 스키마 — A-07·A-14. DB 정본: saved_tickets_status_cols_chk·amount_chk·guard_transition 트리거.
import { z } from "zod";
import { INT4_MAX, type PurchaseStatus } from "@lotto-lab/types";
import { isoDate } from "./primitives.ts";
import { LottoTicketSchema, PensionTicketSchema } from "./numbers.ts";

const common = {
  round: z.int().min(1).max(INT4_MAX),   // saved_tickets.round int4
  source_number_id: z.uuid().optional(),
  idempotency_key: z.uuid(),
};
const favorite = { purchase_status: z.literal("favorite") };
const purchased = {
  purchase_status: z.literal("purchased"),
  purchase_date: isoDate,
  amount_won: z.int().min(0).optional(),
};

/** A-14 본문: purchased로만 전환(날짜 필수·금액 선택). */
export const TicketPurchaseInputSchema = z.strictObject(purchased);

const lotto = { game: z.literal("lotto"), ticket_data: LottoTicketSchema };
const pension = { game: z.literal("pension"), ticket_data: PensionTicketSchema };

/** A-07 본문: game별 ticket_data 형식 × purchase_status별 열 조합. 추가 키 금지. */
export const TicketCreateInputSchema = z.discriminatedUnion("game", [
  z.discriminatedUnion("purchase_status", [
    z.strictObject({ ...common, ...lotto, ...favorite }),
    z.strictObject({ ...common, ...lotto, ...purchased }),
  ]),
  z.discriminatedUnion("purchase_status", [
    z.strictObject({ ...common, ...pension, ...favorite }),
    z.strictObject({ ...common, ...pension, ...purchased }),
  ]),
]);

/** 구매 상태 전환 규칙: purchased→favorite만 금지(R19, 위반 시 422 INVALID_TRANSITION). */
export function isAllowedTransition(from: PurchaseStatus, to: PurchaseStatus): boolean {
  return !(from === "purchased" && to === "favorite");
}
