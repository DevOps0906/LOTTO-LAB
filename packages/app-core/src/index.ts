// @lotto-lab/app-core — 화면 로직이 쓰는 서비스(생성·저장 번호·공개 읽기·판정·19세 확인). 플랫폼 기능은 어댑터로 주입받는다.
// 상대 import는 `.ts` 확장자를 명시한다.
import type { Adapters, AppConfig } from "./adapters.ts";
import { AgeGate } from "./age-gate.ts";
import { AuthService } from "./auth/auth-service.ts";
import { CheckService } from "./check-service.ts";
import { FortuneProfileService } from "./fortune-profile-service.ts";
import { FortuneService } from "./fortune-service.ts";
import { GenerateService } from "./generate-service.ts";
import { LastConfigStore } from "./last-config.ts";
import { LocalData, ThemeStore } from "./local-data.ts";
import { PublicReader } from "./public-read.ts";
import { LocalStore, type Migrations } from "./storage.ts";
import { TicketService } from "./ticket-service.ts";

export type * from "./adapters.ts";
export * from "./errors.ts";
export { AgeGate } from "./age-gate.ts";
export {
  AuthService,
  CONSENT_VERSIONS,
  type AuthField,
  type AuthOutcome,
  type AuthState,
  type ConsentInput,
} from "./auth/auth-service.ts";
export {
  AUTH_MESSAGES,
  EMAIL_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  RESET_SENT_MESSAGE,
  ReturnToMemory,
  SIGNUP_SENT_MESSAGE,
  authErrorCode,
  isValidOtp,
  isValidPassword,
  normalizeEmail,
  type AuthErrorCode,
} from "./auth/rules.ts";
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
export {
  GENERATED_HISTORY_LIMIT,
  GenerateService,
  type GenerateRequest,
  type GenerateResult,
  type GeneratedLine,
} from "./generate-service.ts";
export {
  FortuneProfileService,
  SAJU_HOURS,
  type FortuneProfileErrorCode,
  type FortuneProfileField,
  type FortuneProfileInput,
  type FortuneProfileOutcome,
} from "./fortune-profile-service.ts";
export { FORTUNE_SECRET_KEY, FortuneService, type FortuneOutcome } from "./fortune-service.ts";
// 테마 번호 화면(ui)이 쓰는 선택 목록·입력 타입 — ui는 엔진을 직접 의존하지 않는다.
export {
  DREAM_KEYWORDS,
  DREAM_KEYWORDS_MAX,
  DREAM_KEYWORDS_MIN,
  ZODIAC_ANIMAL_IDS,
  ZODIAC_SIGN_IDS,
  type DreamKeywordId,
  type FortuneMethod,
  type FortuneRequest,
  type FortuneTheme,
  type SajuBirthInput,
  type SajuChartResult,
  type ZodiacAnimalId,
  type ZodiacSignId,
} from "@lotto-lab/fortune-engine";
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
  /** 운세·테마 번호(기기 생성, 입력값 미저장) */
  fortune: FortuneService;
  tickets: TicketService;
  reader: PublicReader;
  checker: CheckService;
  /** 복권별 지난 생성 조건(설정 레코드) */
  lastConfig: LastConfigStore;
  /** 로컬 데이터 내보내기·모두 삭제(M-12) */
  data: LocalData;
  /** 화면 테마 선호(M-12) */
  theme: ThemeStore;
  /** 로그인·가입·계정 삭제(P1). 셸이 AuthClient를 주입하지 않으면 null(게스트 전용). */
  auth: AuthService | null;
  /** 사주 프로필 저장·삭제(P1, A-17). 셸이 FortuneProfileClient를 주입하지 않으면 null. */
  fortuneProfile: FortuneProfileService | null;
  adapters: Adapters;
};

/** 셸이 어댑터·설정을 주입해 한 번 만든다. 저장 큐는 인스턴스당 하나 — 앱에서 하나만 만든다(결정 ①). */
export function createAppCore(
  adapters: Adapters,
  config: AppConfig,
  options: { migrations?: Migrations; /** 로그인 뒤 복귀 허용 경로(셸 라우트) */ authReturnPaths?: readonly string[] } = {},
): AppCore {
  const store = new LocalStore(adapters.store, options.migrations);
  const reader = new PublicReader(config, adapters.fetch, adapters.clock, store);
  const tickets = new TicketService(store, adapters.clock, adapters.random, reader);
  const generator = new GenerateService(store, adapters.clock, adapters.random);
  return {
    ageGate: new AgeGate(store, adapters.clock),
    generator,
    fortune: new FortuneService(store, adapters.store, adapters.clock, adapters.random, generator),
    tickets,
    reader,
    checker: new CheckService(tickets, reader),
    lastConfig: new LastConfigStore(store),
    data: new LocalData(store, adapters.store, adapters.clock),
    theme: new ThemeStore(store, adapters.store),
    auth: adapters.auth ? new AuthService(adapters.auth, { returnPaths: options.authReturnPaths }) : null,
    fortuneProfile: adapters.fortuneProfile ? new FortuneProfileService(adapters.fortuneProfile) : null,
    adapters,
  };
}
