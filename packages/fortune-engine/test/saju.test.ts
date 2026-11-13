// 사주 4주·오행 표시 테스트(task-046). 검증 범위와 한계:
// - 일주(日柱)는 라이브러리와 무관한 독립 공식(율리우스 일수 JD mod 60)으로 1900-01-01~오늘 전수 대조한다.
// - 음력 변환·절입(년주·월주)은 manseryeok@2.0.0 단독 검증이다(독립 골든 없음). 대표값 스모크(1900·1954~61·1987~88·윤달 해)만 한다.
//   KASI 음양력 API 픽스처는 서비스 키 확보 시 추가한다(열린 결정, tasks/task-046.md).
import { describe, expect, it } from "vitest";
import { SAJU_HOUR_IDS, calculateSaju, type SajuBirthInput } from "../src/index.ts";
import { lunarToSolarYmd } from "../src/saju/lib.ts";

const STEMS = "갑을병정무기경신임계";
const BRANCHES = "자축인묘진사오미신유술해";
const TODAY = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const T = "2026-11-13";

const solar = (date: string, hour: SajuBirthInput["hour"] = null): SajuBirthInput => ({ date, calendar: "solar", leap: false, hour });
const lunar = (date: string, leap = false, hour: SajuBirthInput["hour"] = null): SajuBirthInput => ({ date, calendar: "lunar", leap, hour });
const ok = (r: ReturnType<typeof calculateSaju>) => {
  if (!r.ok) throw new Error("unexpected failure");
  return r;
};
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe("일주 독립 공식 전수 대조", () => {
  it("JD mod 60: 1900-01-01 ~ 오늘(KST) 모든 날짜", () => {
    const first = Date.UTC(1900, 0, 1);
    const last = Date.UTC(Number(TODAY.slice(0, 4)), Number(TODAY.slice(5, 7)) - 1, Number(TODAY.slice(8, 10)));
    let checked = 0;
    for (let ms = first; ms <= last; ms += 86_400_000) {
      const jd = ms / 86_400_000 + 2_440_588; // 해당 날짜 정오의 정수 JD
      const idx = (jd + 49) % 60;
      const expected = STEMS[idx % 10]! + BRANCHES[idx % 12]!;
      const r = ok(calculateSaju(solar(ymd(ms)), TODAY));
      const got = r.pillars.day.stem + r.pillars.day.branch;
      if (got !== expected) throw new Error(`일주 불일치 ${ymd(ms)}`);
      checked++;
    }
    expect(checked).toBeGreaterThan(46_000);
  });
});

describe("ⓑ 변환 실패", () => {
  it("양력 윤달 표시·없는 날짜·형식 오류", () => {
    expect(calculateSaju({ ...solar("2000-05-05"), leap: true }, T)).toEqual({ ok: false, reason: "UNCONVERTIBLE_DATE" });
    expect(calculateSaju(solar("2023-02-29"), T).ok).toBe(false);
    expect(calculateSaju(solar("2023-2-9"), T).ok).toBe(false);
  });
  it("윤달 없는 해의 윤달", () => {
    expect(calculateSaju(lunar("2022-05-10", true), T).ok).toBe(false);
    expect(calculateSaju(lunar("2023-02-10", true), T).ok).toBe(true); // 2023년은 윤2월
  });
  it("29일 달의 30일", () => {
    let found = false;
    for (let m = 1; m <= 12 && !found; m++) {
      if (lunarToSolarYmd(2024, m, 29, false) && !lunarToSolarYmd(2024, m, 30, false)) {
        found = true;
        expect(calculateSaju(lunar(`2024-${String(m).padStart(2, "0")}-30`), T).ok).toBe(false);
        expect(calculateSaju(lunar(`2024-${String(m).padStart(2, "0")}-29`), T).ok).toBe(true);
      }
    }
    expect(found).toBe(true);
  });
  it("1900 이전·오늘 이후(양력·음력 변환 결과 기준)", () => {
    expect(calculateSaju(solar("1899-12-31"), T).ok).toBe(false);
    expect(calculateSaju(solar("1900-01-01"), T).ok).toBe(true);
    expect(calculateSaju(solar(T), T).ok).toBe(true);
    expect(calculateSaju(solar("2026-11-14"), T).ok).toBe(false);
    expect(calculateSaju(lunar("1899-06-01"), T).ok).toBe(false);
    expect(calculateSaju(lunar("2026-12-25"), T).ok).toBe(false); // 양력 2027-02 → 오늘 이후
  });
  it("알 수 없는 시진 id", () => {
    expect(calculateSaju(solar("2000-05-05", "xx" as never), T).ok).toBe(false);
  });
});

describe("대표값 스모크(라이브러리 단독)", () => {
  it("2024-02-10: 갑진년 병인월 갑진일", () => {
    const r = ok(calculateSaju(solar("2024-02-10"), T));
    const s = (p: { stem: string; branch: string }) => p.stem + p.branch;
    expect([s(r.pillars.year), s(r.pillars.month), s(r.pillars.day)]).toEqual(["갑진", "병인", "갑진"]);
    expect(r.pillars.hour).toBeNull();
  });
  it("1992-10-24 = 계유일(기준일)", () => {
    const r = ok(calculateSaju(solar("1992-10-24"), T));
    expect(r.pillars.day.stem + r.pillars.day.branch).toBe("계유");
  });
  it("음력 윤달 입력 = 같은 날의 양력 입력(2023 윤2월 15일 = 양력 2023-04-05)", () => {
    for (const hour of [null, "myo", "ja"] as const) {
      expect(calculateSaju(lunar("2023-02-15", true, hour), T)).toEqual(calculateSaju(solar("2023-04-05", hour), T));
    }
  });
  it.each(["1900-01-01", "1954-03-21", "1955-06-15", "1961-08-10", "1987-05-10", "1988-10-01", "2000-02-29"])("%s: 계산 성공·오행 합 6/8", (date) => {
    const a = ok(calculateSaju(solar(date), T));
    const b = ok(calculateSaju(solar(date, "o"), T));
    expect(Object.values(a.elements).reduce((x, y) => x + y, 0)).toBe(6);
    expect(Object.values(b.elements).reduce((x, y) => x + y, 0)).toBe(8);
  });
});

describe("시주·오행", () => {
  it("시진 id마다 시주 지지가 자·축·인…해 순서", () => {
    SAJU_HOUR_IDS.forEach((id, i) => {
      const r = ok(calculateSaju(solar("2001-07-20", id), T));
      expect(r.pillars.hour?.branch).toBe(BRANCHES[i]);
    });
  });
  it("오행 분포 = 천간·지지 글자별 오행 합산", () => {
    const r = ok(calculateSaju(solar("1990-03-15", "myo"), T));
    const all = [r.pillars.year, r.pillars.month, r.pillars.day, r.pillars.hour!];
    const expected = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
    for (const p of all) {
      expected[p.stemElement as keyof typeof expected]++;
      expected[p.branchElement as keyof typeof expected]++;
    }
    expect(r.elements).toEqual(expected);
  });
  it("같은 입력은 같은 결과", () => {
    expect(calculateSaju(lunar("1985-04-12", false, "sa"), T)).toEqual(calculateSaju(lunar("1985-04-12", false, "sa"), T));
  });
});

describe("절입 경계(±60분 여유)", () => {
  it("입춘(2024-02-04 17:27 KST)일: 시진 모름·신시·유시는 경계, 인시·자시는 아님", () => {
    expect(ok(calculateSaju(solar("2024-02-04"), T)).boundary).toBe(true);
    expect(ok(calculateSaju(solar("2024-02-04", "sin"), T)).boundary).toBe(true);
    expect(ok(calculateSaju(solar("2024-02-04", "yu"), T)).boundary).toBe(true); // 17시 시작 − 60분 = 16:00 ≤ 17:27
    expect(ok(calculateSaju(solar("2024-02-04", "in"), T)).boundary).toBe(false);
    expect(ok(calculateSaju(solar("2024-02-04", "ja"), T)).boundary).toBe(false);
  });
  it("절입이 없는 날은 경계 아님", () => {
    expect(ok(calculateSaju(solar("2024-03-01"), T)).boundary).toBe(false);
  });
});

// 절입 시각(KST, 라이브러리 값)을 고정한 경계 사례: 입춘 2024-02-04 17:27 · 2008-02-04 20:00 · 입동 2021-11-07 13:59 · 입춘 2021-02-03 23:59
describe("절입 경계 고정 사례(±60분 정확 일치·1분 안·1분 밖)", () => {
  const b = (d: string, h: SajuBirthInput["hour"]) => ok(calculateSaju(solar(d, h), T));
  const s = (p: { stem: string; branch: string }) => p.stem + p.branch;
  it("정확히 +60분/−60분 경계는 포함(2008-02-04 20:00)", () => {
    expect(b("2008-02-04", "yu").boundary).toBe(true); // 구간 끝 19:00 + 60 = 20:00
    expect(b("2008-02-04", "hae").boundary).toBe(true); // 구간 시작 21:00 − 60 = 20:00
    expect(b("2008-02-04", "sin").boundary).toBe(false); // 끝 17:00 + 60 = 18:00
  });
  it("1분 안·1분 밖(2000-01-06 10:01 소한)", () => {
    expect(b("2000-01-06", "o").boundary).toBe(true); // 시작 11:00 − 60 = 10:00 ≤ 10:01
    expect(b("2000-01-06", "jin").boundary).toBe(false); // 끝 09:00 + 60 = 10:00 < 10:01
  });
  it("구간 시작이 입춘 전이면 년·월주는 절입 전 값(2024-02-04 17:27)", () => {
    const before = b("2024-02-04", "sin"); // 시작 15:00
    const after = b("2024-02-04", "sul"); // 시작 19:00
    expect([s(before.pillars.year), s(before.pillars.month)]).toEqual(["계묘", "을축"]);
    expect([s(after.pillars.year), s(after.pillars.month)]).toEqual(["갑진", "병인"]);
    expect(before.boundary).toBe(true);
  });
  it("일반 월 절입 전 값(2021-11-07 13:59 입동 → 전 무술월, 후 기해월)", () => {
    expect(s(b("2021-11-07", "mi").pillars.month)).toBe("무술");
    expect(s(b("2021-11-07", "sin").pillars.month)).toBe("기해");
  });
  it("자시는 전날 23:00~당일 01:00(±60분): 2021-02-03 23:59 입춘", () => {
    const next = b("2021-02-04", "ja"); // 구간 02-03 23:00~02-04 01:00 → 23:59 안
    expect(next.boundary).toBe(true);
    expect(s(next.pillars.year)).toBe("신축"); // 4주는 02-04 00:00 기준
    const same = b("2021-02-03", "ja"); // 구간 02-02 23:00~02-03 01:00, 여유 포함 02-03 02:00까지 → 밖
    expect(same.boundary).toBe(false);
    expect(s(same.pillars.year)).toBe("경자");
  });
});

describe("오행 독립 기대표", () => {
  const STEM_EL: Record<string, string> = { 갑: "목", 을: "목", 병: "화", 정: "화", 무: "토", 기: "토", 경: "금", 신: "금", 임: "수", 계: "수" };
  const BRANCH_EL: Record<string, string> = { 자: "수", 축: "토", 인: "목", 묘: "목", 진: "토", 사: "화", 오: "화", 미: "토", 신: "금", 유: "금", 술: "토", 해: "수" };
  it("천간 10자·지지 12자 본기 오행(모든 글자가 등장하는 범위 전수)", () => {
    const stems = new Set<string>();
    const branches = new Set<string>();
    for (let n = 0; n < 400; n++) {
      const date = new Date(Date.UTC(1990, 0, 1 + n)).toISOString().slice(0, 10);
      for (const h of SAJU_HOUR_IDS) {
        const r = ok(calculateSaju(solar(date, h), T));
        for (const p of [r.pillars.year, r.pillars.month, r.pillars.day, r.pillars.hour!]) {
          expect(p.stemElement).toBe(STEM_EL[p.stem]);
          expect(p.branchElement).toBe(BRANCH_EL[p.branch]);
          stems.add(p.stem);
          branches.add(p.branch);
        }
      }
    }
    expect(stems.size).toBe(10);
    expect(branches.size).toBe(12);
  });
  it("고정 날짜 분포 리터럴: 2024-02-10 갑진·병인·갑진(시진 모름)", () => {
    expect(ok(calculateSaju(solar("2024-02-10"), T)).elements).toEqual({ 목: 3, 화: 1, 토: 2, 금: 0, 수: 0 });
  });
});
