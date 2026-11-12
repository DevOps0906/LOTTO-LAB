// KST 날짜(결정 ②)와 엔진 오류 타입.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ENGINE_ERROR_CODES, EngineError, isEngineError, kstToday } from "../src/index.ts";

describe("kstToday — UTC+9 경계", () => {
  it("UTC 14:59:59.999는 같은 날, 15:00은 다음 날", () => {
    expect(kstToday(new Date("2026-11-12T14:59:59.999Z"))).toBe("2026-11-12");
    expect(kstToday(new Date("2026-11-12T15:00:00.000Z"))).toBe("2026-11-13");
  });

  it("연·월 경계와 윤년", () => {
    expect(kstToday(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
    expect(kstToday(new Date("2028-02-28T15:00:00Z"))).toBe("2028-02-29");
  });

  it("속성: KST 오프셋 문자열로 만든 시각은 그 날짜를 돌려준다", () => {
    const day = fc.date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2099-12-31T00:00:00Z"), noInvalidDate: true });
    fc.assert(
      fc.property(day, fc.integer({ min: 0, max: 24 * 60 - 1 }), (d, minute) => {
        const ymd = d.toISOString().slice(0, 10);
        const hh = String(Math.floor(minute / 60)).padStart(2, "0");
        const mm = String(minute % 60).padStart(2, "0");
        expect(kstToday(new Date(`${ymd}T${hh}:${mm}:00+09:00`))).toBe(ymd);
      }),
    );
  });

  it("잘못된 Date는 INVALID_INPUT", () => {
    expect(() => kstToday(new Date("x"))).toThrow(EngineError);
    expect(() => kstToday("2026-11-12" as never)).toThrow(EngineError);
  });
});

describe("EngineError", () => {
  it("code·hint를 가진 Error다", () => {
    const e = new EngineError("IMPOSSIBLE_COMBINATION", "lotto.fixed_excluded_overlap");
    expect(e).toBeInstanceOf(Error);
    expect(isEngineError(e)).toBe(true);
    expect(isEngineError(new Error("x"))).toBe(false);
    expect(e.name).toBe("EngineError");
    expect(e.code).toBe("IMPOSSIBLE_COMBINATION");
    expect(e.hint).toBe("lotto.fixed_excluded_overlap");
    expect(e.message).toBe("IMPOSSIBLE_COMBINATION: lotto.fixed_excluded_overlap");
    expect(new EngineError("INVALID_INPUT", "h", "사용자 문구").message).toBe("사용자 문구");
  });

  it("코드 목록", () => {
    expect(ENGINE_ERROR_CODES).toStrictEqual(["IMPOSSIBLE_COMBINATION", "INVALID_INPUT"]);
  });
});
