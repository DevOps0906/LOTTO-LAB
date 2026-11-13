// 운세 번호 엔진 입력·결과 타입(task-037, ADR-0005 착수 결정 ①~⑧).
import type { PensionTicket } from "@lotto-lab/types";
import type { DreamKeywordId } from "./dream-dictionary.ts";

/** 별자리 12궁 ID(영문 소문자 고정 — 바꾸면 결과가 바뀐다). */
export const ZODIAC_SIGN_IDS = [
  "aries", "taurus", "gemini", "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
] as const;
export type ZodiacSignId = (typeof ZODIAC_SIGN_IDS)[number];

/** 띠 12지 ID. 직접 선택만 받는다(자동 판정 없음, 결정 ⑥). */
export const ZODIAC_ANIMAL_IDS = [
  "rat", "ox", "tiger", "rabbit", "dragon", "snake",
  "horse", "goat", "monkey", "rooster", "dog", "pig",
] as const;
export type ZodiacAnimalId = (typeof ZODIAC_ANIMAL_IDS)[number];

/** 12시진 ID(자시~해시). 경계 해석은 task-046이 맡는다. */
export const SAJU_HOUR_IDS = ["ja", "chuk", "in", "myo", "jin", "sa", "o", "mi", "sin", "yu", "sul", "hae"] as const;
export type SajuHourId = (typeof SAJU_HOUR_IDS)[number];

export type SajuBirthInput = {
  /** YYYY-MM-DD, 1900-01-01 이상·ctx.date 이하 */
  date: string;
  calendar: "solar" | "lunar";
  /** calendar = "solar"이면 false만 허용 */
  leap: boolean;
  /** 모르면 null */
  hour: SajuHourId | null;
};

/** 사주 표시용 한 기둥(task-046). 한글 천간·지지와 각 오행(목·화·토·금·수). */
export type SajuPillar = { stem: string; branch: string; stemElement: string; branchElement: string };
/** 오행 분포 = 천간·지지 본기 글자 수(지장간 제외). 시진 모름은 합 6, 아니면 8. */
export type SajuElementCounts = { 목: number; 화: number; 토: number; 금: number; 수: number };
/** 변환할 수 없는 날짜(윤달 없는 해의 윤달·29일 달의 30일·1900 이전·오늘 이후)는 ok:false — 번호 생성은 그대로 가능. */
export type SajuChartResult =
  | {
      ok: true;
      pillars: { year: SajuPillar; month: SajuPillar; day: SajuPillar; hour: SajuPillar | null };
      elements: SajuElementCounts;
      /** 절입이 출생 구간(±60분) 안이라 년주·월주가 출생 시각에 따라 다를 수 있음 */
      boundary: boolean;
    }
  | { ok: false; reason: "UNCONVERTIBLE_DATE" };

export type FortuneTheme =
  | { kind: "zodiac_sign"; sign: ZodiacSignId }
  | { kind: "zodiac_animal"; animal: ZodiacAnimalId }
  | { kind: "birthday"; date: string }
  | { kind: "anniversary"; date: string }
  | { kind: "lucky"; numbers: number[] }
  | { kind: "dream"; keywords: DreamKeywordId[] }
  | { kind: "saju"; birth: SajuBirthInput };

export type FortuneThemeKind = FortuneTheme["kind"];

/** generated_batches.method 중 운세 엔진이 내는 값(결정 ①). */
export type FortuneMethod = "zodiac" | "birthday" | "condition" | "dream" | "saju";

export type FortuneLottoRequest = { theme: FortuneTheme; game: "lotto" };
/** 행운 숫자 테마는 로또 전용 — 연금 요청은 INVALID_INPUT(fortune.lucky_pension). */
export type FortunePensionRequest = { theme: FortuneTheme; game: "pension"; groups: number[] };
export type FortuneRequest = FortuneLottoRequest | FortunePensionRequest;

/** date = kstToday(now) `YYYY-MM-DD`, deviceSecret = 설치 때 만든 32바이트 hex(`^[0-9a-f]{64}$`). */
export type FortuneContext = { date: string; deviceSecret: string };

export const FORTUNE_ENGINE_VERSION = "fortune@1";

export type FortuneLottoResult = {
  method: FortuneMethod;
  games: number[][];
  engine_version: `${typeof FORTUNE_ENGINE_VERSION}+lotto@1`;
};
export type FortunePensionResult = {
  method: FortuneMethod;
  tickets: PensionTicket[];
  engine_version: `${typeof FORTUNE_ENGINE_VERSION}+pension@1`;
};
export type FortuneResult = FortuneLottoResult | FortunePensionResult;

/** 검증·정규화를 마친 입력. 시드 문자열을 만들 때만 쓰고 결과·오류에 넣지 않는다(결정 ⑤). */
export type NormalizedInput = { theme: FortuneTheme; date: string; deviceSecret: string } & (
  | { game: "lotto" }
  | { game: "pension"; groups: number[] }
);
