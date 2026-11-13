// 사주 프로필(task-041, A-17): 동의 후 저장·조회·삭제. 생년월일·시진은 개인정보 — 로컬 저장·로그·분석 금지(이 서비스는 저장소를 쓰지 않는다).
// 오류는 코드만 매핑한다(PostgREST detail·message·hint에는 생년월일 원문이 있을 수 있다 → 버린다, cause도 만들지 않는다).
// 클라이언트 검증은 필수·형식뿐 — 날짜 범위·음력 유효성은 DB CHECK(23514)가 판정해 INVALID_INPUT으로 돌려준다.
import type { FortuneProfileClient, FortuneProfileFailure, FortuneProfileRow } from "./adapters.ts";

/** 12시진(자~해) id·표시. 엔진 SAJU_HOUR_IDS와 같은 순서. */
export const SAJU_HOURS = [
  { id: "ja", label: "자시(23~01시)" },
  { id: "chuk", label: "축시(01~03시)" },
  { id: "in", label: "인시(03~05시)" },
  { id: "myo", label: "묘시(05~07시)" },
  { id: "jin", label: "진시(07~09시)" },
  { id: "sa", label: "사시(09~11시)" },
  { id: "o", label: "오시(11~13시)" },
  { id: "mi", label: "미시(13~15시)" },
  { id: "sin", label: "신시(15~17시)" },
  { id: "yu", label: "유시(17~19시)" },
  { id: "sul", label: "술시(19~21시)" },
  { id: "hae", label: "해시(21~23시)" },
] as const;

const HOUR_IDS: readonly string[] = SAJU_HOURS.map((h) => h.id);
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export type FortuneProfileErrorCode = "OFFLINE" | "SESSION_EXPIRED" | "FORBIDDEN" | "INVALID_INPUT" | "CONSENT_REQUIRED" | "UNKNOWN";
export type FortuneProfileField = "birth_date" | "calendar" | "is_leap_month" | "birth_hour" | "consent";
export type FortuneProfileOutcome<T> = { ok: true; value: T } | { ok: false; code: FortuneProfileErrorCode; field?: FortuneProfileField };

/** 화면 입력(날짜 `YYYY-MM-DD`, 시각 모름 = null 또는 빈 문자열). */
export type FortuneProfileInput = {
  birth_date: string;
  calendar: string;
  is_leap_month: boolean;
  birth_hour: string | null;
};

const fail = (code: FortuneProfileErrorCode, field?: FortuneProfileField): { ok: false; code: FortuneProfileErrorCode; field?: FortuneProfileField } =>
  field ? { ok: false, code, field } : { ok: false, code };

/** 실패 → 코드(문구·detail 없음). */
function codeOf(f: FortuneProfileFailure): FortuneProfileErrorCode {
  if (f.network || f.status === 0) return "OFFLINE";
  if (f.status === 401 || f.code === "PGRST301" || f.code === "PGRST303") return "SESSION_EXPIRED";
  if (f.code === "42501") return "FORBIDDEN";
  if (f.code !== null && (f.code === "23514" || f.code.startsWith("22"))) return "INVALID_INPUT";
  return "UNKNOWN";
}

function parseRow(row: FortuneProfileRow): FortuneProfileRow | null {
  const valid =
    typeof row.birth_date === "string" &&
    DATE_PATTERN.test(row.birth_date) &&
    (row.calendar === "solar" || row.calendar === "lunar") &&
    typeof row.is_leap_month === "boolean" &&
    (row.birth_hour === null || HOUR_IDS.includes(row.birth_hour));
  return valid ? { birth_date: row.birth_date, calendar: row.calendar, is_leap_month: row.is_leap_month, birth_hour: row.birth_hour } : null;
}

export class FortuneProfileService {
  private readonly client: FortuneProfileClient;

  constructor(client: FortuneProfileClient) {
    this.client = client;
  }

  /** 내 프로필(없으면 null). 서버 값이 형식에 맞지 않으면 UNKNOWN. */
  async load(): Promise<FortuneProfileOutcome<FortuneProfileRow | null>> {
    const result = await this.run(() => this.client.get());
    if (!result.ok) return result;
    if (result.value === null) return result;
    const row = parseRow(result.value);
    return row ? { ok: true, value: row } : fail("UNKNOWN");
  }

  /** 동의 후 저장(A-17 PUT). 5개 열을 항상 명시한다 — 시각 모름 = null, 양력이면 윤달 false. */
  async save(input: FortuneProfileInput, consent: boolean): Promise<FortuneProfileOutcome<FortuneProfileRow>> {
    if (!consent) return fail("CONSENT_REQUIRED", "consent");
    if (!DATE_PATTERN.test(input.birth_date)) return fail("INVALID_INPUT", "birth_date");
    if (input.calendar !== "solar" && input.calendar !== "lunar") return fail("INVALID_INPUT", "calendar");
    const hour = input.birth_hour === null || input.birth_hour === "" ? null : input.birth_hour;
    if (hour !== null && !HOUR_IDS.includes(hour)) return fail("INVALID_INPUT", "birth_hour");
    if (input.calendar === "solar" && input.is_leap_month) return fail("INVALID_INPUT", "is_leap_month");
    const row: FortuneProfileRow = {
      birth_date: input.birth_date,
      calendar: input.calendar,
      is_leap_month: input.calendar === "lunar" && input.is_leap_month,
      birth_hour: hour,
    };
    const result = await this.run(() => this.client.upsert(row));
    return result.ok ? { ok: true, value: row } : result;
  }

  /** 프로필 삭제(A-17 DELETE). 행이 없어도 성공. */
  async remove(): Promise<FortuneProfileOutcome<null>> {
    return this.run(() => this.client.delete());
  }

  private async run<T>(call: () => Promise<{ ok: true; value: T } | { ok: false; failure: FortuneProfileFailure }>): Promise<FortuneProfileOutcome<T>> {
    try {
      const result = await call();
      if (result.ok) return result;
      const code = codeOf(result.failure);
      return code === "INVALID_INPUT" ? fail(code, "birth_date") : fail(code); // 서버 CHECK 위반 = 날짜 범위·음력·윤달 조합
    } catch {
      return fail("UNKNOWN"); // 예외 객체(메시지에 입력값이 있을 수 있다)는 버린다
    }
  }
}
