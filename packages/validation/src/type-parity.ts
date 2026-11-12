// 컴파일 단언: 각 스키마의 z.input·z.output이 @lotto-lab/types의 정본 타입과 양방향으로 같다.
// 어긋나면 `pnpm typecheck`가 실패한다. 런타임 코드 없음.
import type { z } from "zod";
import type {
  DrawLotto,
  DrawPension,
  ErrorResponse,
  LottoGeneratorConfig,
  LottoNumbers,
  LottoTicket,
  PensionGeneratorConfig,
  PensionNumbers,
  PensionTicket,
  PrizeEntry,
  StatisticsCache,
  TicketCreateInput,
  TicketPurchaseInput,
} from "@lotto-lab/types";
import type {
  DrawLottoSchema,
  DrawPensionSchema,
  LottoPrizeEntrySchema,
  PrizeEntrySchema,
  StatisticsCacheSchema,
} from "./draws.ts";
import type { ErrorResponseSchema } from "./errors.ts";
import type { LottoGeneratorConfigSchema, PensionGeneratorConfigSchema } from "./generator.ts";
import type { LottoNumbersSchema, LottoTicketSchema, PensionNumbersSchema, PensionTicketSchema } from "./numbers.ts";
import type { TicketCreateInputSchema, TicketPurchaseInputSchema } from "./tickets.ts";

/** 엄격 동치(한쪽 방향 할당 가능성만이 아니라 선택 속성·readonly까지 같아야 true). */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
/** 입력(z.input)과 출력(z.output) 둘 다 T와 같다(제네릭 정의 안에서는 판정이 미뤄지므로 사용처에서 단언). */
type Both<S extends z.ZodType, T> = [Equal<z.input<S>, T>, Equal<z.output<S>, T>];
type ExpectBoth<T extends [true, true]> = T;

// 회차 읽기의 prizes는 요소별 관대한 파싱(transform)이라 입력 쪽만 unknown[]이다.
type WithRawPrizes<T> = { [K in keyof T]: K extends "prizes" ? unknown[] : T[K] };

export type TypeParity = [
  ExpectBoth<Both<typeof LottoNumbersSchema, LottoNumbers>>,
  ExpectBoth<Both<typeof PensionNumbersSchema, PensionNumbers>>,
  ExpectBoth<Both<typeof LottoTicketSchema, LottoTicket>>,
  ExpectBoth<Both<typeof PensionTicketSchema, PensionTicket>>,
  ExpectBoth<Both<typeof PrizeEntrySchema, PrizeEntry>>,
  ExpectBoth<Both<typeof LottoPrizeEntrySchema, PrizeEntry>>,
  Expect<Equal<z.output<typeof DrawLottoSchema>, DrawLotto>>,
  Expect<Equal<z.input<typeof DrawLottoSchema>, WithRawPrizes<DrawLotto>>>,
  Expect<Equal<z.output<typeof DrawPensionSchema>, DrawPension>>,
  Expect<Equal<z.input<typeof DrawPensionSchema>, WithRawPrizes<DrawPension>>>,
  ExpectBoth<Both<typeof StatisticsCacheSchema, StatisticsCache>>,
  ExpectBoth<Both<typeof TicketPurchaseInputSchema, TicketPurchaseInput>>,
  ExpectBoth<Both<typeof TicketCreateInputSchema, TicketCreateInput>>,
  ExpectBoth<Both<typeof LottoGeneratorConfigSchema, LottoGeneratorConfig>>,
  ExpectBoth<Both<typeof PensionGeneratorConfigSchema, PensionGeneratorConfig>>,
  ExpectBoth<Both<typeof ErrorResponseSchema, ErrorResponse>>,
];
