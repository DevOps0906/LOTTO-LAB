// fortune-engine 테스트(task-037): 속성(결정성·로또·연금)·골든 벡터·정규화·오류 비노출·사전 금지 문구.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EngineError } from "@lotto-lab/lottery-core";
import {
  DREAM_KEYWORDS,
  SAJU_HOUR_IDS,
  ZODIAC_ANIMAL_IDS,
  ZODIAC_SIGN_IDS,
  generateFortune,
  type FortuneContext,
  type FortuneRequest,
  type FortuneTheme,
} from "../src/index.ts";
import { normalize } from "../src/normalize.ts";
import { buildSeed } from "../src/seed.ts";

const SECRET = "0".repeat(64);
const CTX: FortuneContext = { date: "2026-11-13", deviceSecret: SECRET };
const FORBIDDEN = /당첨|확률|운이\s*오르|대박|보장/;
const DREAM_IDS = DREAM_KEYWORDS.map((k) => k.id);

// ── 생성기 ──
const isoDate = (min: string, max: string) =>
  fc
    .date({ min: new Date(`${min}T00:00:00Z`), max: new Date(`${max}T00:00:00Z`), noInvalidDate: true })
    .map((d) => d.toISOString().slice(0, 10));
const secretArb = fc.stringMatching(/^[0-9a-f]{64}$/);
const ctxArb = fc.record({ date: isoDate("2026-01-01", "2030-12-31"), deviceSecret: secretArb });
const luckyArb = fc.uniqueArray(fc.integer({ min: 1, max: 45 }), { minLength: 1, maxLength: 5 });
const nonLuckyThemeArb: fc.Arbitrary<FortuneTheme> = fc.oneof(
  fc.constantFrom(...ZODIAC_SIGN_IDS).map((sign) => ({ kind: "zodiac_sign" as const, sign })),
  fc.constantFrom(...ZODIAC_ANIMAL_IDS).map((animal) => ({ kind: "zodiac_animal" as const, animal })),
  isoDate("1900-01-01", "2025-12-31").map((date) => ({ kind: "birthday" as const, date })),
  isoDate("1900-01-01", "2099-12-31").map((date) => ({ kind: "anniversary" as const, date })),
  fc
    .uniqueArray(fc.constantFrom(...DREAM_IDS), { minLength: 1, maxLength: 3 })
    .map((keywords) => ({ kind: "dream" as const, keywords })),
  fc
    .record({
      date: isoDate("1900-01-01", "2025-12-31"),
      calendar: fc.constantFrom("solar" as const, "lunar" as const),
      leap: fc.boolean(),
      hour: fc.option(fc.constantFrom(...SAJU_HOUR_IDS), { nil: null }),
    })
    .map((b) => {
      const lunar = b.calendar === "lunar";
      // 음력 일은 01~30만(형식 검사) — 양력 31일은 음력이면 30일로 바꾼다.
      const date = lunar && b.date.endsWith("-31") ? `${b.date.slice(0, 8)}30` : b.date;
      return { kind: "saju" as const, birth: { ...b, date, leap: lunar && b.leap } };
    }),
);
const themeArb: fc.Arbitrary<FortuneTheme> = fc.oneof(
  nonLuckyThemeArb,
  luckyArb.map((numbers) => ({ kind: "lucky" as const, numbers })),
);
const groupsArb = fc.uniqueArray(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 5 });

function catchEngineError(fn: () => unknown): EngineError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError);
    return e as EngineError;
  }
  throw new Error("EngineError가 던져지지 않았다");
}

function expectInvalid(fn: () => unknown, hint: string): EngineError {
  const e = catchEngineError(fn);
  expect(e.code).toBe("INVALID_INPUT");
  expect(e.hint).toBe(hint);
  return e;
}

describe("속성 — 로또", () => {
  it("결정성: 같은 입력+날짜+비밀값 → 같은 결과", () => {
    fc.assert(
      fc.property(themeArb, ctxArb, (theme, ctx) => {
        const a = generateFortune({ theme, game: "lotto" }, ctx);
        const b = generateFortune({ theme: structuredClone(theme), game: "lotto" }, { ...ctx });
        expect(b).toStrictEqual(a);
      }),
      { numRuns: 300 },
    );
  });

  it("5게임 · 6개 · 1~45 · 중복 없음 · 오름차순 · 행운 숫자 포함", () => {
    fc.assert(
      fc.property(themeArb, ctxArb, (theme, ctx) => {
        const r = generateFortune({ theme, game: "lotto" }, ctx);
        expect(r.engine_version).toBe("fortune@1+lotto@1");
        expect(r.games).toHaveLength(5);
        expect(new Set(r.games.map((g) => g.join(","))).size).toBe(5);
        for (const g of r.games) {
          expect(g).toHaveLength(6);
          expect(new Set(g).size).toBe(6);
          for (const n of g) expect(Number.isInteger(n) && n >= 1 && n <= 45).toBe(true);
          expect([...g].sort((x, y) => x - y)).toStrictEqual(g);
          if (theme.kind === "lucky") for (const n of theme.numbers) expect(g).toContain(n);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("날짜·비밀값이 바뀌면 대부분 결과가 바뀐다", () => {
    const theme: FortuneTheme = { kind: "zodiac_sign", sign: "leo" };
    const base = generateFortune({ theme, game: "lotto" }, CTX).games;
    const otherDate = generateFortune({ theme, game: "lotto" }, { ...CTX, date: "2026-11-14" }).games;
    const otherSecret = generateFortune({ theme, game: "lotto" }, { ...CTX, deviceSecret: "f".repeat(64) }).games;
    expect(otherDate).not.toStrictEqual(base);
    expect(otherSecret).not.toStrictEqual(base);
  });
});

describe("속성 — 연금", () => {
  it("결정성 · 6자리 문자열 · 선택 조 전부(오름차순) · 기본 번호 1개", () => {
    fc.assert(
      fc.property(nonLuckyThemeArb, groupsArb, ctxArb, (theme, groups, ctx) => {
        const r = generateFortune({ theme, game: "pension", groups }, ctx);
        const again = generateFortune({ theme, game: "pension", groups: [...groups].reverse() }, ctx);
        expect(again).toStrictEqual(r);
        expect(r.engine_version).toBe("fortune@1+pension@1");
        expect(r.tickets.map((t) => t.group_no)).toStrictEqual([...groups].sort((a, b) => a - b));
        for (const t of r.tickets) {
          expect(typeof t.digits).toBe("string");
          expect(t.digits).toMatch(/^[0-9]{6}$/);
        }
        expect(new Set(r.tickets.map((t) => t.digits)).size).toBe(1);
      }),
      { numRuns: 300 },
    );
  });
});

describe("method 매핑(ADR-0005 ①)", () => {
  it.each([
    [{ kind: "zodiac_sign", sign: "aries" }, "zodiac"],
    [{ kind: "zodiac_animal", animal: "pig" }, "zodiac"],
    [{ kind: "birthday", date: "1990-05-05" }, "birthday"],
    [{ kind: "anniversary", date: "2030-05-05" }, "birthday"],
    [{ kind: "lucky", numbers: [7] }, "condition"],
    [{ kind: "dream", keywords: ["pig"] }, "dream"],
    [{ kind: "saju", birth: { date: "1990-05-05", calendar: "lunar", leap: true, hour: "ja" } }, "saju"],
  ] as [FortuneTheme, string][])("%o → %s", (theme, method) => {
    expect(generateFortune({ theme, game: "lotto" }, CTX).method).toBe(method);
  });
});

describe("골든 벡터(하위 엔진 버전 포함)", () => {
  it("로또 · 꿈", () => {
    const r = generateFortune({ theme: { kind: "dream", keywords: ["water", "pig"] }, game: "lotto" }, CTX);
    expect(r.engine_version).toBe("fortune@1+lotto@1");
    expect(r.games).toStrictEqual(GOLDEN_LOTTO_DREAM);
  });

  it("로또 · 행운 숫자", () => {
    const r = generateFortune({ theme: { kind: "lucky", numbers: [7, 1] }, game: "lotto" }, CTX);
    expect(r.engine_version).toBe("fortune@1+lotto@1");
    expect(r.method).toBe("condition");
    expect(r.games).toStrictEqual(GOLDEN_LOTTO_LUCKY);
  });

  it("연금 · 사주", () => {
    const birth = { date: "1990-05-05", calendar: "solar", leap: false, hour: null } as const;
    const r = generateFortune({ theme: { kind: "saju", birth }, game: "pension", groups: [3, 1] }, CTX);
    expect(r.engine_version).toBe("fortune@1+pension@1");
    expect(r.tickets).toStrictEqual(GOLDEN_PENSION_SAJU);
  });

  it("시드 형식(ADR-0005 ②)", () => {
    const n = normalize(
      { theme: { kind: "dream", keywords: ["water", "pig", "water"] }, game: "pension", groups: [3, 1] },
      CTX,
    );
    expect(buildSeed(n)).toBe(`fortune@1|dream|dream:pig,water|2026-11-13|pension|${SECRET}`);
    const s = normalize(
      { theme: { kind: "saju", birth: { date: "1990-05-05", calendar: "lunar", leap: true, hour: null } }, game: "lotto" },
      CTX,
    );
    expect(buildSeed(s)).toBe(`fortune@1|saju|saju:1990-05-05|lunar|1|-|2026-11-13|lotto|${SECRET}`);
  });
});

describe("정규화(NFKC·trim)", () => {
  it("전각 숫자·공백 날짜 ≡ 반각 날짜", () => {
    const a = generateFortune({ theme: { kind: "birthday", date: "1990-01-05" }, game: "lotto" }, CTX);
    const b = generateFortune(
      { theme: { kind: "birthday", date: " １９９０-０１-０５ " }, game: "lotto" },
      { date: "２０２６-１１-１３ ", deviceSecret: ` ${SECRET}\n` },
    );
    expect(b).toStrictEqual(a);
  });

  it("ID 문자열·꿈 키워드 순서·중복", () => {
    const a = generateFortune({ theme: { kind: "zodiac_sign", sign: "leo" }, game: "lotto" }, CTX);
    const b = generateFortune({ theme: { kind: "zodiac_sign", sign: " ｌｅｏ " as "leo" }, game: "lotto" }, CTX);
    expect(b).toStrictEqual(a);
    const d1 = generateFortune({ theme: { kind: "dream", keywords: ["pig", "water"] }, game: "lotto" }, CTX);
    const d2 = generateFortune({ theme: { kind: "dream", keywords: ["water", "pig", "pig"] }, game: "lotto" }, CTX);
    expect(d2).toStrictEqual(d1);
  });

  it("행운 숫자 순서 무관", () => {
    const a = generateFortune({ theme: { kind: "lucky", numbers: [1, 7] }, game: "lotto" }, CTX);
    const b = generateFortune({ theme: { kind: "lucky", numbers: [7, 1] }, game: "lotto" }, CTX);
    expect(b).toStrictEqual(a);
  });
});

describe("입력 오류(INVALID_INPUT, hint만)", () => {
  const lotto = (theme: unknown): FortuneRequest => ({ theme, game: "lotto" }) as FortuneRequest;
  const birth = (over: Record<string, unknown>) =>
    lotto({ kind: "saju", birth: { date: "1990-05-05", calendar: "solar", leap: false, hour: null, ...over } });

  it.each<[string, () => unknown]>([
    ["fortune.context", () => generateFortune(lotto({ kind: "zodiac_sign", sign: "leo" }), null as never)],
    ["fortune.device_secret", () => generateFortune(lotto({ kind: "zodiac_sign", sign: "leo" }), { ...CTX, deviceSecret: "" })],
    ["fortune.device_secret", () => generateFortune(lotto({ kind: "zodiac_sign", sign: "leo" }), { ...CTX, deviceSecret: "A".repeat(64) })],
    ["fortune.device_secret", () => generateFortune(lotto({ kind: "zodiac_sign", sign: "leo" }), { ...CTX, deviceSecret: 1 as never })],
    ["fortune.date", () => generateFortune(lotto({ kind: "zodiac_sign", sign: "leo" }), { ...CTX, date: "2026-02-30" })],
    ["fortune.date", () => generateFortune(lotto({ kind: "zodiac_sign", sign: "leo" }), { ...CTX, date: "20261113" })],
    ["fortune.request", () => generateFortune(null as never, CTX)],
    ["fortune.game", () => generateFortune({ theme: { kind: "zodiac_sign", sign: "leo" }, game: "keno" } as never, CTX)],
    ["fortune.theme", () => generateFortune(lotto(null), CTX)],
    ["fortune.theme", () => generateFortune(lotto({ kind: "tarot" }), CTX)],
    ["fortune.zodiac_sign", () => generateFortune(lotto({ kind: "zodiac_sign", sign: "ophiuchus" }), CTX)],
    ["fortune.zodiac_animal", () => generateFortune(lotto({ kind: "zodiac_animal", animal: "cat" }), CTX)],
    ["fortune.birthday", () => generateFortune(lotto({ kind: "birthday", date: "2026-11-14" }), CTX)],
    ["fortune.birthday", () => generateFortune(lotto({ kind: "birthday", date: "1899-12-31" }), CTX)],
    ["fortune.anniversary", () => generateFortune(lotto({ kind: "anniversary", date: "05-05" }), CTX)],
    ["fortune.lucky", () => generateFortune(lotto({ kind: "lucky", numbers: [1, 2, 3, 4, 5, 6] }), CTX)],
    ["fortune.lucky", () => generateFortune(lotto({ kind: "lucky", numbers: [] }), CTX)],
    ["fortune.lucky", () => generateFortune(lotto({ kind: "lucky", numbers: [0] }), CTX)],
    ["fortune.lucky", () => generateFortune(lotto({ kind: "lucky", numbers: [3, 3] }), CTX)],
    ["fortune.lucky", () => generateFortune(lotto({ kind: "lucky", numbers: "7" }), CTX)],
    ["fortune.lucky_pension", () => generateFortune({ theme: { kind: "lucky", numbers: [7] }, game: "pension", groups: [1] }, CTX)],
    ["fortune.dream", () => generateFortune(lotto({ kind: "dream", keywords: [] }), CTX)],
    ["fortune.dream", () => generateFortune(lotto({ kind: "dream", keywords: ["pig", "dog", "cat", "sun"] }), CTX)],
    ["fortune.dream", () => generateFortune(lotto({ kind: "dream", keywords: ["unicorn"] }), CTX)],
    ["fortune.saju", () => generateFortune(lotto({ kind: "saju", birth: "1990" }), CTX)],
    ["fortune.saju.date", () => birthGen(birth({ date: "2027-01-01" }))],
    ["fortune.saju.calendar", () => birthGen(birth({ calendar: "moon" }))],
    ["fortune.saju.date", () => birthGen(birth({ date: "1990-02-30" }))],
    ["fortune.saju.date", () => birthGen(birth({ calendar: "lunar", date: "1990-13-01" }))],
    ["fortune.saju.date", () => birthGen(birth({ calendar: "lunar", date: "1990-01-31" }))],
    ["fortune.saju.date", () => birthGen(birth({ calendar: "lunar", date: "1990-00-10" }))],
    ["fortune.saju.date", () => birthGen(birth({ calendar: "lunar", date: "1899-12-30" }))],
    ["fortune.saju.leap", () => birthGen(birth({ leap: true }))],
    ["fortune.saju.leap", () => birthGen(birth({ calendar: "lunar", leap: "no" }))],
    ["fortune.saju.hour", () => birthGen(birth({ hour: "noon" }))],
    ["fortune.groups", () => generateFortune({ theme: { kind: "zodiac_sign", sign: "leo" }, game: "pension", groups: [] }, CTX)],
    ["fortune.groups", () => generateFortune({ theme: { kind: "zodiac_sign", sign: "leo" }, game: "pension", groups: [6] }, CTX)],
    ["fortune.groups", () => generateFortune({ theme: { kind: "zodiac_sign", sign: "leo" }, game: "pension", groups: [2, 2] }, CTX)],
  ])("%s", (hint, fn) => {
    expectInvalid(fn, hint);
  });

  function birthGen(req: FortuneRequest): unknown {
    return generateFortune(req, CTX);
  }

  it("오류 message·detail·직렬화에 시드·비밀값·생일 문자열이 없다", () => {
    const secret = "abcdef0123456789".repeat(4);
    const birthday = "1990-05-05";
    const seedLike = "fortune@1";
    const cases: (() => unknown)[] = [
      () => generateFortune(lotto({ kind: "birthday", date: "2099-05-05" }), { date: "2026-11-13", deviceSecret: secret }),
      () => generateFortune(lotto({ kind: "birthday", date: birthday }), { date: "2026-11-13", deviceSecret: secret.toUpperCase() }),
      () => generateFortune(birth({ date: birthday, hour: "noon" }), { date: "2026-11-13", deviceSecret: secret }),
      () => generateFortune(lotto({ kind: "lucky", numbers: [1, 2, 3, 4, 5, 6] }), { date: "2026-11-13", deviceSecret: secret }),
      () => generateFortune({ theme: { kind: "birthday", date: birthday }, game: "pension", groups: [9] }, { date: "2026-11-13", deviceSecret: secret }),
    ];
    for (const fn of cases) {
      const e = catchEngineError(fn);
      const dump = [e.message, e.hint, JSON.stringify(e), JSON.stringify(e.detail ?? {}), String(e.stack)].join("\n");
      for (const s of [secret, secret.toUpperCase(), birthday, "2099-05-05", seedLike, "2026-11-13"]) {
        expect(dump).not.toContain(s);
      }
      expect(dump).not.toMatch(FORBIDDEN);
    }
  });

  it("결과에도 시드·비밀값·입력 날짜가 없다", () => {
    const r = generateFortune({ theme: { kind: "birthday", date: "1990-05-05" }, game: "lotto" }, CTX);
    const dump = JSON.stringify(r);
    for (const s of [SECRET, "1990-05-05", "fortune@1|", "2026-11-13"]) expect(dump).not.toContain(s);
  });
});

describe("연금 조 선택과 기본 번호", () => {
  it("같은 입력·날짜·기기면 조 [1]·[1,2]·[3,5]의 기본 digits가 같다", () => {
    fc.assert(
      fc.property(nonLuckyThemeArb, ctxArb, (theme, ctx) => {
        const digits = [[1], [1, 2], [3, 5]].map((groups) => {
          const r = generateFortune({ theme, game: "pension", groups }, ctx);
          expect(r.tickets).toHaveLength(groups.length);
          return new Set(r.tickets.map((t) => t.digits));
        });
        for (const d of digits) expect([...d]).toStrictEqual([...digits[0]!]);
      }),
      { numRuns: 200 },
    );
  });
});

describe("음력 사주 날짜", () => {
  it("음력 2월 30일·30일은 통과한다(양력 달력 검사 안 함)", () => {
    for (const date of ["1990-02-30", "2000-12-30", " １９９０-０２-３０ "]) {
      const r = generateFortune(
        { theme: { kind: "saju", birth: { date, calendar: "lunar", leap: false, hour: null } }, game: "lotto" },
        CTX,
      );
      expect(r.method).toBe("saju");
      expect(r.games).toHaveLength(5);
    }
  });
});

describe("꿈 사전", () => {
  it("약 30개 · id 영문 소문자 · 중복 없음 · 라벨 있음", () => {
    expect(DREAM_KEYWORDS.length).toBeGreaterThanOrEqual(25);
    expect(DREAM_KEYWORDS.length).toBeLessThanOrEqual(40);
    expect(new Set(DREAM_IDS).size).toBe(DREAM_IDS.length);
    expect(new Set(DREAM_KEYWORDS.map((k) => k.label)).size).toBe(DREAM_KEYWORDS.length);
    for (const k of DREAM_KEYWORDS) {
      expect(k.id).toMatch(/^[a-z]+$/);
      expect(k.label.length).toBeGreaterThan(0);
    }
  });

  it("라벨·hint에 금지 문구가 없다", () => {
    for (const k of DREAM_KEYWORDS) expect(k.label).not.toMatch(FORBIDDEN);
    const hints = new Set<string>();
    const tries: (() => unknown)[] = [
      () => generateFortune(null as never, CTX),
      () => generateFortune({ theme: { kind: "lucky", numbers: [1] }, game: "pension", groups: [1] }, CTX),
      () => generateFortune({ theme: { kind: "dream", keywords: ["x" as "pig"] }, game: "lotto" }, CTX),
    ];
    for (const fn of tries) hints.add(catchEngineError(fn).hint);
    for (const h of hints) expect(h).not.toMatch(FORBIDDEN);
  });
});

// 첫 실행 값으로 고정한다. 바뀌면 fortune·lotto·pension 중 하나의 버전을 올려야 한다(ADR-0005 ④).
const GOLDEN_LOTTO_DREAM: number[][] = [
  [3, 16, 23, 30, 31, 42],
  [15, 16, 20, 21, 23, 38],
  [7, 16, 22, 35, 40, 44],
  [5, 10, 16, 29, 35, 37],
  [4, 15, 17, 23, 26, 34],
];
const GOLDEN_LOTTO_LUCKY: number[][] = [
  [1, 7, 12, 18, 27, 37],
  [1, 7, 19, 22, 28, 42],
  [1, 3, 7, 27, 43, 45],
  [1, 4, 7, 10, 21, 45],
  [1, 7, 11, 18, 37, 38],
];
const GOLDEN_PENSION_SAJU: { group_no: number; digits: string }[] = [
  { group_no: 1, digits: "680746" },
  { group_no: 3, digits: "680746" },
];
