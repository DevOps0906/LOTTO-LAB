// @lotto-lab/app-core — 화면 로직이 쓰는 서비스(생성·저장 번호·공개 읽기·판정·19세 확인). 플랫폼 기능은 어댑터로 주입받는다.
// 상대 import는 `.ts` 확장자를 명시한다.
import type { Adapters, AppConfig } from "./adapters.ts";
import { AgeGate } from "./age-gate.ts";
import { CheckService } from "./check-service.ts";
import { GenerateService } from "./generate-service.ts";
import { LastConfigStore } from "./last-config.ts";
import { LocalData, ThemeStore } from "./local-data.ts";
import { PublicReader } from "./public-read.ts";
import { LocalStore, type Migrations } from "./storage.ts";
import { TicketService } from "./ticket-service.ts";

export type * from "./adapters.ts";
export * from "./errors.ts";
export { AgeGate } from "./age-gate.ts";
export { CheckService, type CheckOutcome } from "./check-service.ts";
export { LastConfigStore } from "./last-config.ts";
export {
  EXPORT_FORMAT_VERSION,
  LocalData,
  THEME_KEY,
  THEME_PREFERENCES,
  ThemeStore,
  type LocalDataSummary,
  type LocalExport,
  type ThemePreference,
} from "./local-data.ts";
export { GENERATED_HISTORY_LIMIT, GenerateService, type GenerateRequest, type GenerateResult } from "./generate-service.ts";
export {
  DRAW_CACHE_TTL_MS,
  DRAW_PAGE_DEFAULT,
  DRAW_PAGE_MAX,
  PublicReader,
  STAT_CACHE_TTL_MS,
  assertAppConfig,
  type ListDrawsOptions,
  type ReadError,
  type ReadOptions,
  type ReadResult,
} from "./public-read.ts";
export { CACHE_VERSION, KEY_PREFIX, LocalStore, recordKey, type Migrations, type RecordKind } from "./storage.ts";
export {
  ROUND_DEFAULT_MAX_AGE_DAYS,
  TICKET_LIMIT,
  TicketService,
  newIdempotencyKey,
  type RoundSuggestion,
  type SaveFromGeneratedInput,
  type SaveTicketInput,
} from "./ticket-service.ts";

export type AppCore = {
  ageGate: AgeGate;
  generator: GenerateService;
  tickets: TicketService;
  reader: PublicReader;
  checker: CheckService;
  /** 복권별 지난 생성 조건(설정 레코드) */
  lastConfig: LastConfigStore;
  /** 로컬 데이터 내보내기·모두 삭제(M-12) */
  data: LocalData;
  /** 화면 테마 선호(M-12) */
  theme: ThemeStore;
  adapters: Adapters;
};

/** 셸이 어댑터·설정을 주입해 한 번 만든다. 저장 큐는 인스턴스당 하나 — 앱에서 하나만 만든다(결정 ①). */
export function createAppCore(adapters: Adapters, config: AppConfig, options: { migrations?: Migrations } = {}): AppCore {
  const store = new LocalStore(adapters.store, options.migrations);
  const reader = new PublicReader(config, adapters.fetch, adapters.clock, store);
  const tickets = new TicketService(store, adapters.clock, adapters.random, reader);
  return {
    ageGate: new AgeGate(store, adapters.clock),
    generator: new GenerateService(store, adapters.clock, adapters.random),
    tickets,
    reader,
    checker: new CheckService(tickets, reader),
    lastConfig: new LastConfigStore(store),
    data: new LocalData(store, adapters.store, adapters.clock),
    theme: new ThemeStore(store, adapters.store),
    adapters,
  };
}
