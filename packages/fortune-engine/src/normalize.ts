// 입력 검증·정규화(task-037, ADR-0005 ②⑤). 문자열은 NFKC·trim 후 검사한다(전각 숫자·앞뒤 공백 허용).
// 오류는 invalidInput(hint)만 던진다 — 입력값·비밀값·시드는 message·detail에 넣지 않는다(결정 ⑤).
import { invalidInput } from "@lotto-lab/lottery-core";
import {
  LOTTO_NUMBER_MAX,
  LOTTO_NUMBER_MIN,
  LOTTO_PICK_COUNT,
  PENSION_GROUP_MAX,
  PENSION_GROUP_MIN,
} from "@lotto-lab/types";
import { DREAM_KEYWORDS, DREAM_KEYWORDS_MAX, DREAM_KEYWORDS_MIN, type DreamKeywordId } from "./dream-dictionary.ts";
import {
  SAJU_HOUR_IDS,
  ZODIAC_ANIMAL_IDS,
  ZODIAC_SIGN_IDS,
  type FortuneContext,
  type FortuneRequest,
  type FortuneTheme,
  type NormalizedInput,
  type SajuBirthInput,
  type SajuHourId,
  type ZodiacAnimalId,
  type ZodiacSignId,
} from "./types.ts";

/** 32바이트 hex. 셸이 설치 때 만들어 로컬에 저장한다 — 서버가 결과로 생일을 역산하지 못하게 한다(결정 ②). */
const SECRET_PATTERN = /^[0-9a-f]{64}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** 음력 날짜 형식: 월 01~12, 일 01~30(음력 달은 29·30일). 실제 존재 여부는 만세력(task-046)이 판정한다. */
const LUNAR_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|30)$/;
/** 생년월일·사주 날짜 하한. */
const BIRTH_DATE_MIN = "1900-01-01";
/** 행운 숫자 상한: 6개면 조합이 1개라 5게임을 만들 수 없다(계획 승인). */
export const LUCKY_NUMBERS_MAX = LOTTO_PICK_COUNT - 1;

const DREAM_IDS: readonly string[] = DREAM_KEYWORDS.map((k) => k.id);

function nfkcTrim(v: unknown, hint: string): string {
  if (typeof v !== "string") throw invalidInput(hint);
  return v.normalize("NFKC").trim();
}

/** 실제 달력 날짜인 `YYYY-MM-DD`인지(윤년 포함). */
function isIsoDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function dateField(v: unknown, hint: string): string {
  const s = nfkcTrim(v, hint);
  if (!isIsoDate(s)) throw invalidInput(hint);
  return s;
}

/** 지난 날짜 범위: 1900-01-01 이상, 오늘(ctx.date) 이하. ISO 문자열은 사전순 = 날짜순. */
function inPastRange(s: string, today: string, hint: string): string {
  if (s < BIRTH_DATE_MIN || s > today) throw invalidInput(hint);
  return s;
}

/** 지난 양력 날짜(생일·양력 사주). */
function pastDateField(v: unknown, today: string, hint: string): string {
  return inPastRange(dateField(v, hint), today, hint);
}

/** 지난 음력 날짜(음력 사주): 형식만 검사하고 범위 비교는 양력과 같은 문자열 비교를 쓴다. */
function pastLunarDateField(v: unknown, today: string, hint: string): string {
  const s = nfkcTrim(v, hint);
  if (!LUNAR_DATE.test(s)) throw invalidInput(hint);
  return inPastRange(s, today, hint);
}

function idField<T extends string>(v: unknown, ids: readonly T[], hint: string): T {
  const s = nfkcTrim(v, hint);
  if (!(ids as readonly string[]).includes(s)) throw invalidInput(hint);
  return s as T;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// 배열 검사는 인덱스 루프로 한다(희소 배열의 빈 칸 = undefined → 실패).
function luckyNumbers(v: unknown): number[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > LUCKY_NUMBERS_MAX) throw invalidInput("fortune.lucky");
  const out: number[] = [];
  for (let i = 0; i < v.length; i++) {
    const n: unknown = v[i];
    if (!Number.isInteger(n) || (n as number) < LOTTO_NUMBER_MIN || (n as number) > LOTTO_NUMBER_MAX) {
      throw invalidInput("fortune.lucky");
    }
    if (out.includes(n as number)) throw invalidInput("fortune.lucky");
    out.push(n as number);
  }
  return out.sort((a, b) => a - b);
}

function dreamKeywords(v: unknown): DreamKeywordId[] {
  if (!Array.isArray(v) || v.length < DREAM_KEYWORDS_MIN || v.length > DREAM_KEYWORDS_MAX) {
    throw invalidInput("fortune.dream");
  }
  const out = new Set<DreamKeywordId>();
  for (let i = 0; i < v.length; i++) out.add(idField(v[i], DREAM_IDS as readonly DreamKeywordId[], "fortune.dream"));
  return [...out].sort();
}

function sajuBirth(v: unknown, today: string): SajuBirthInput {
  if (!isObject(v)) throw invalidInput("fortune.saju");
  const calendar = idField(v.calendar, ["solar", "lunar"] as const, "fortune.saju.calendar");
  const date =
    calendar === "lunar"
      ? pastLunarDateField(v.date, today, "fortune.saju.date")
      : pastDateField(v.date, today, "fortune.saju.date");
  if (typeof v.leap !== "boolean" || (calendar === "solar" && v.leap)) throw invalidInput("fortune.saju.leap");
  const hour: SajuHourId | null = v.hour === null ? null : idField(v.hour, SAJU_HOUR_IDS, "fortune.saju.hour");
  return { date, calendar, leap: v.leap, hour };
}

function theme(v: unknown, today: string): FortuneTheme {
  if (!isObject(v)) throw invalidInput("fortune.theme");
  switch (v.kind) {
    case "zodiac_sign":
      return { kind: "zodiac_sign", sign: idField<ZodiacSignId>(v.sign, ZODIAC_SIGN_IDS, "fortune.zodiac_sign") };
    case "zodiac_animal":
      return {
        kind: "zodiac_animal",
        animal: idField<ZodiacAnimalId>(v.animal, ZODIAC_ANIMAL_IDS, "fortune.zodiac_animal"),
      };
    case "birthday":
      return { kind: "birthday", date: pastDateField(v.date, today, "fortune.birthday") };
    case "anniversary":
      // 기념일은 날짜만(계획 승인) — 다가올 기념일도 허용한다.
      return { kind: "anniversary", date: dateField(v.date, "fortune.anniversary") };
    case "lucky":
      return { kind: "lucky", numbers: luckyNumbers(v.numbers) };
    case "dream":
      return { kind: "dream", keywords: dreamKeywords(v.keywords) };
    case "saju":
      return { kind: "saju", birth: sajuBirth(v.birth, today) };
    default:
      throw invalidInput("fortune.theme");
  }
}

function pensionGroups(v: unknown): number[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > PENSION_GROUP_MAX - PENSION_GROUP_MIN + 1) {
    throw invalidInput("fortune.groups");
  }
  const out: number[] = [];
  for (let i = 0; i < v.length; i++) {
    const g: unknown = v[i];
    if (!Number.isInteger(g) || (g as number) < PENSION_GROUP_MIN || (g as number) > PENSION_GROUP_MAX) {
      throw invalidInput("fortune.groups");
    }
    if (out.includes(g as number)) throw invalidInput("fortune.groups");
    out.push(g as number);
  }
  return out.sort((a, b) => a - b);
}

/**
 * 요청·문맥을 검증하고 정규화한다. 순서: 문맥(비밀값·날짜) → 요청 모양 → 테마 → 복권별 항목.
 * INVALID_INPUT hint: `fortune.device_secret|date|request|game|theme|zodiac_sign|zodiac_animal|birthday|anniversary
 * |lucky|lucky_pension|dream|saju|saju.date|saju.calendar|saju.leap|saju.hour|groups`
 */
export function normalize(req: FortuneRequest, ctx: FortuneContext): NormalizedInput {
  if (!isObject(ctx)) throw invalidInput("fortune.context");
  const deviceSecret = nfkcTrim(ctx.deviceSecret, "fortune.device_secret");
  if (!SECRET_PATTERN.test(deviceSecret)) throw invalidInput("fortune.device_secret");
  const date = dateField(ctx.date, "fortune.date");

  if (!isObject(req)) throw invalidInput("fortune.request");
  const r = req as Record<string, unknown>;
  if (r.game !== "lotto" && r.game !== "pension") throw invalidInput("fortune.game");
  const t = theme(r.theme, date);
  if (r.game === "lotto") return { theme: t, date, deviceSecret, game: "lotto" };
  if (t.kind === "lucky") throw invalidInput("fortune.lucky_pension");
  return { theme: t, date, deviceSecret, game: "pension", groups: pensionGroups(r.groups) };
}
