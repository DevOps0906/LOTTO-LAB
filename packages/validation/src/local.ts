// 게스트 로컬 레코드 스키마(task-016 결정 ④) — app-core가 기기 저장소(`ll:v1:<종류>:<id>`)에 쓰는 형식.
// 서버 행(saved_tickets·generated_numbers)과 별개: 로컬은 round NULL(회차 미확인) 허용, id·created_at·레코드 버전 `v` 포함.
// 상태 분리(AGENTS 4장): 생성 이력(LocalGenerated)과 저장 번호(LocalTicket)는 다른 스키마·다른 키 종류다.
import { z } from "zod";
import { GAMES_PER_REQUEST_MAX, GAMES_PER_REQUEST_MIN } from "@lotto-lab/types";
import { int4, intRange, isoDate, isoDateTime, pensionGroup } from "./primitives.ts";
import { LottoNumbersSchema, LottoTicketSchema, PensionNumbersSchema, PensionTicketSchema } from "./numbers.ts";

/** 현재 로컬 레코드 버전. 형식을 바꾸면 올리고 app-core 마이그레이션(레코드 단위 지연 변환)을 추가한다. */
export const LOCAL_RECORD_VERSION = 1;

/** 생성 출처(generated_batches.method, 05#2·ADR-0005와 같은 값). */
export const GENERATION_METHODS = ["random", "condition", "zodiac", "birthday", "dream", "saju"] as const;

const base = {
  v: z.literal(LOCAL_RECORD_VERSION),
  id: z.uuid(),
  created_at: isoDateTime,
};

const ticketCommon = {
  ...base,
  updated_at: isoDateTime,
  /** 대상 회차. null = 사용자가 아직 회차를 확인·입력하지 않음(결정 ⑧) — 판정 대상 아님. */
  round: int4(1).nullable(),
  /** 생성 이력에서 저장한 경우의 로컬 생성 레코드 id. */
  source_number_id: z.uuid().nullable(),
  /** 생성 시점에 고정한 멱등 키(R18, 결정 ②). */
  idempotency_key: z.uuid(),
};
const favorite = { purchase_status: z.literal("favorite"), purchase_date: z.null(), amount_won: z.null() };
const purchased = {
  purchase_status: z.literal("purchased"),
  purchase_date: isoDate,
  amount_won: z.int().min(0).nullable(),
};
const lotto = { game: z.literal("lotto"), ticket_data: LottoTicketSchema };
const pension = { game: z.literal("pension"), ticket_data: PensionTicketSchema };

/** 저장 번호(favorite·purchased). 추가 키 금지. */
export const LocalTicketSchema = z.discriminatedUnion("game", [
  z.discriminatedUnion("purchase_status", [
    z.strictObject({ ...ticketCommon, ...lotto, ...favorite }),
    z.strictObject({ ...ticketCommon, ...lotto, ...purchased }),
  ]),
  z.discriminatedUnion("purchase_status", [
    z.strictObject({ ...ticketCommon, ...pension, ...favorite }),
    z.strictObject({ ...ticketCommon, ...pension, ...purchased }),
  ]),
]);

const generatedCommon = {
  ...base,
  batch_id: z.uuid(),
  line_no: intRange(GAMES_PER_REQUEST_MIN, GAMES_PER_REQUEST_MAX),
  engine_version: z.string().min(1),
  method: z.enum(GENERATION_METHODS),
};

/** 생성(추천) 이력 한 줄. 구매·당첨 이력이 아니다. 로또는 group_no null, 연금은 조 1~5. */
export const LocalGeneratedSchema = z.discriminatedUnion("game", [
  z.strictObject({ ...generatedCommon, game: z.literal("lotto"), numbers: LottoNumbersSchema, group_no: z.null() }),
  z.strictObject({ ...generatedCommon, game: z.literal("pension"), numbers: PensionNumbersSchema, group_no: pensionGroup }),
]);

/** 앱 설정. age_confirmed_at = 만 19세 확인 시각(DF-6), 미확인이면 null. */
export const LocalSettingsSchema = z.strictObject({
  v: z.literal(LOCAL_RECORD_VERSION),
  age_confirmed_at: isoDateTime.nullable(),
});

export type LocalTicket = z.output<typeof LocalTicketSchema>;
export type LocalGenerated = z.output<typeof LocalGeneratedSchema>;
export type LocalSettings = z.output<typeof LocalSettingsSchema>;
export type GenerationMethod = (typeof GENERATION_METHODS)[number];
