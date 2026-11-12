// 번호(generated_numbers.numbers)·티켓(saved_tickets.ticket_data) 스키마.
// DB 정본: private.valid_numbers / private.valid_ticket(20261112180000_user_data.sql) — 추가 키 금지(strict).
import { z } from "zod";
import type { GameType } from "@lotto-lab/types";
import { lottoNums, pensionDigits, pensionGroup } from "./primitives.ts";

export const LottoNumbersSchema = z.strictObject({ nums: lottoNums });
export const PensionNumbersSchema = z.strictObject({ digits: pensionDigits });

export const LottoTicketSchema = z.strictObject({ nums: lottoNums });
export const PensionTicketSchema = z.strictObject({ group_no: pensionGroup, digits: pensionDigits });

/** valid_numbers(game, data)와 같은 판정. */
export const NUMBERS_SCHEMAS = { lotto: LottoNumbersSchema, pension: PensionNumbersSchema } satisfies Record<
  GameType,
  z.ZodType
>;
/** valid_ticket(game, data)와 같은 판정. */
export const TICKET_SCHEMAS = { lotto: LottoTicketSchema, pension: PensionTicketSchema } satisfies Record<
  GameType,
  z.ZodType
>;
