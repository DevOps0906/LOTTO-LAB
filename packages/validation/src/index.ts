// @lotto-lab/validation — Zod 스키마. 타입 정본은 @lotto-lab/types(type-parity.ts가 동치를 단언).
// 상대 import는 `.ts` 확장자를 명시한다(Deno 재사용 대비).
export { intRange, isoDate, isoDateTime, lottoNums, pensionDigits } from "./primitives.ts";
export {
  LottoNumbersSchema,
  LottoTicketSchema,
  NUMBERS_SCHEMAS,
  PensionNumbersSchema,
  PensionTicketSchema,
  TICKET_SCHEMAS,
} from "./numbers.ts";
export { DrawLottoSchema, DrawPensionSchema, PrizeEntrySchema, PrizesSchema, StatisticsCacheSchema } from "./draws.ts";
export { TicketCreateInputSchema, TicketPurchaseInputSchema, isAllowedTransition } from "./tickets.ts";
export { LottoGeneratorConfigSchema, PensionGeneratorConfigSchema } from "./generator.ts";
export { ErrorCodeSchema, ErrorResponseSchema } from "./errors.ts";
export type { TypeParity } from "./type-parity.ts";
