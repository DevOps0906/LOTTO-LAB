// 판정 단위 벡터·속성 테스트(task-012). 등위 기준: 로또 6/45 공식 1~5등, 연금복권 720+ 1~7등 + 보너스.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LOTTO_NUMBER_MAX, LOTTO_NUMBER_MIN, LOTTO_PICK_COUNT, PENSION_GROUP_MAX, PENSION_GROUP_MIN } from "@lotto-lab/types";
import { EngineError, judgeLotto, judgePension } from "../src/index.ts";

const DRAW = { nums: [3, 11, 19, 27, 35, 43], bonus: 7 };

function expectInvalid(fn: () => unknown, hint: string): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError);
    expect((e as EngineError).code).toBe("INVALID_INPUT");
    expect((e as EngineError).hint).toBe(hint);
    return;
  }
  throw new Error("EngineError가 던져지지 않았다");
}

describe("judgeLotto — 등위별 벡터", () => {
  it.each([
    [[3, 11, 19, 27, 35, 43], 1],
    [[3, 11, 19, 27, 35, 7], 2],
    [[3, 11, 19, 27, 35, 44], 3],
    [[3, 11, 19, 27, 7, 44], 4],
    [[3, 11, 19, 1, 2, 4], 5],
    [[3, 11, 7, 1, 2, 4], null],
    [[1, 2, 4, 5, 6, 8], null],
  ])("%j → %s", (nums, rank) => {
    expect(judgeLotto({ nums }, DRAW)).toStrictEqual({ matched_rank: rank, bonus_hit: false });
  });

  it("6개 일치는 1등이다(보너스와 무관, 2등 아님)", () => {
    expect(judgeLotto({ nums: [...DRAW.nums] }, DRAW).matched_rank).toBe(1);
  });

  it("입력 전제 위반은 INVALID_INPUT", () => {
    expectInvalid(() => judgeLotto({ nums: [1, 1, 2, 3, 4, 5] }, DRAW), "ticket.nums");
    expectInvalid(() => judgeLotto({ nums: [1, 2, 3, 4, 5] }, DRAW), "ticket.nums");
    expectInvalid(() => judgeLotto({ nums: [0, 2, 3, 4, 5, 6] }, DRAW), "ticket.nums");
    expectInvalid(() => judgeLotto({ nums: [1.5, 2, 3, 4, 5, 6] }, DRAW), "ticket.nums");
    expectInvalid(() => judgeLotto({ nums: [1, 2, 3, 4, 5, 6] }, { nums: [1, 2, 3, 4, 5, 46], bonus: 7 }), "draw.nums");
    expectInvalid(() => judgeLotto({ nums: [1, 2, 3, 4, 5, 6] }, { ...DRAW, bonus: 3 }), "draw.bonus");
    expectInvalid(() => judgeLotto({ nums: [1, 2, 3, 4, 5, 6] }, { ...DRAW, bonus: 0 }), "draw.bonus");
    expectInvalid(() => judgeLotto(null as never, DRAW), "ticket.nums");
  });
});

describe("judgePension — 등위별 벡터", () => {
  const draw = { group_no: 3, digits: "123456", bonus_digits: "987654" };

  it.each([
    [3, "123456", 1],
    [1, "123456", 2],
    [3, "023456", 3],
    [3, "003456", 4],
    [3, "000456", 5],
    [3, "000056", 6],
    [3, "000006", 7],
    [3, "123450", null],
    [3, "923450", null],
  ])("%s조 %s → %s", (group_no, digits, rank) => {
    expect(judgePension({ group_no, digits }, draw)).toStrictEqual({ matched_rank: rank, bonus_hit: false });
  });

  it("123456 대 123450 → 낙첨(앞자리 일치는 등위가 아니다)", () => {
    expect(judgePension({ group_no: 3, digits: "123450" }, draw).matched_rank).toBeNull();
  });

  it("000719 — 앞자리 0을 보존해 1등으로 판정한다", () => {
    const d = { group_no: 1, digits: "000719", bonus_digits: "111111" };
    expect(judgePension({ group_no: 1, digits: "000719" }, d)).toStrictEqual({ matched_rank: 1, bonus_hit: false });
    expect(judgePension({ group_no: 1, digits: "100719" }, d).matched_rank).toBe(3);
  });

  // ASSUMPTION(연금 보너스 독립): 공식 규정 미확인 가정 — 보너스는 조 무관 6자리 일치, 등위와 동시 당첨 허용.
  it("ASSUMPTION(연금 보너스 독립): 보너스 6자리 일치는 조와 무관하게 bonus_hit", () => {
    expect(judgePension({ group_no: 5, digits: "987654" }, draw)).toStrictEqual({ matched_rank: null, bonus_hit: true });
    const both = { group_no: 2, digits: "555555", bonus_digits: "555555" };
    expect(judgePension({ group_no: 2, digits: "555555" }, both)).toStrictEqual({ matched_rank: 1, bonus_hit: true });
  });

  it("입력 전제 위반은 INVALID_INPUT", () => {
    expectInvalid(() => judgePension({ group_no: 0, digits: "123456" }, draw), "ticket.group_no");
    expectInvalid(() => judgePension({ group_no: 6, digits: "123456" }, draw), "ticket.group_no");
    expectInvalid(() => judgePension({ group_no: 1, digits: "12345" }, draw), "ticket.digits");
    expectInvalid(() => judgePension({ group_no: 1, digits: 123456 as never }, draw), "ticket.digits");
    expectInvalid(() => judgePension({ group_no: 1, digits: "12345a" }, draw), "ticket.digits");
    expectInvalid(() => judgePension({ group_no: 1, digits: "123456" }, { ...draw, group_no: 9 }), "draw.group_no");
    expectInvalid(() => judgePension({ group_no: 1, digits: "123456" }, { ...draw, digits: "719" }), "draw.digits");
    expectInvalid(() => judgePension({ group_no: 1, digits: "123456" }, { ...draw, bonus_digits: "" }), "draw.bonus_digits");
  });
});

// ── 속성 ──
const lottoNum = fc.integer({ min: LOTTO_NUMBER_MIN, max: LOTTO_NUMBER_MAX });
/** 서로 다른 7개: 앞 6개 = 당첨 번호, 마지막 = 보너스. */
const lottoDraw = fc
  .uniqueArray(lottoNum, { minLength: LOTTO_PICK_COUNT + 1, maxLength: LOTTO_PICK_COUNT + 1 })
  .map((xs) => ({ nums: xs.slice(0, LOTTO_PICK_COUNT), bonus: xs[LOTTO_PICK_COUNT]! }));
const lottoTicket = fc.uniqueArray(lottoNum, { minLength: LOTTO_PICK_COUNT, maxLength: LOTTO_PICK_COUNT });
const rankScore = (r: number | null): number => (r === null ? 99 : r); // 작을수록 좋다, 낙첨이 가장 나쁨

describe("judgeLotto — 속성", () => {
  it("등위는 일치 개수로만 정해지고 bonus_hit은 항상 false", () => {
    fc.assert(
      fc.property(lottoTicket, lottoDraw, (nums, draw) => {
        const matched = nums.filter((n) => draw.nums.includes(n)).length;
        const r = judgeLotto({ nums }, draw);
        expect(r.bonus_hit).toBe(false);
        if (matched < 3) expect(r.matched_rank).toBeNull();
        if (matched === 6) expect(r.matched_rank).toBe(1);
        if (matched === 5) expect(r.matched_rank).toBe(nums.includes(draw.bonus) ? 2 : 3);
        if (matched === 4) expect(r.matched_rank).toBe(4);
        if (matched === 3) expect(r.matched_rank).toBe(5);
      }),
    );
  });

  it("티켓 번호 순서는 결과에 영향이 없다", () => {
    fc.assert(
      fc.property(lottoTicket, lottoDraw, (nums, draw) => {
        const reversed = [...nums].reverse();
        const sorted = [...nums].sort((a, b) => a - b);
        const r = judgeLotto({ nums }, draw);
        expect(judgeLotto({ nums: reversed }, draw)).toStrictEqual(r);
        expect(judgeLotto({ nums: sorted }, draw)).toStrictEqual(r);
      }),
    );
  });

  it("단조성: 불일치 번호 하나를 당첨 번호로 바꾸면 등위가 나빠지지 않는다", () => {
    fc.assert(
      fc.property(lottoTicket, lottoDraw, fc.nat(), fc.nat(), (nums, draw, i, j) => {
        const misses = nums.filter((n) => !draw.nums.includes(n));
        const unused = draw.nums.filter((n) => !nums.includes(n));
        fc.pre(misses.length > 0 && unused.length > 0);
        const out = misses[i % misses.length]!;
        const into = unused[j % unused.length]!;
        const next = nums.map((n) => (n === out ? into : n));
        expect(rankScore(judgeLotto({ nums: next }, draw).matched_rank)).toBeLessThanOrEqual(
          rankScore(judgeLotto({ nums }, draw).matched_rank),
        );
      }),
    );
  });

  it("대칭 아님: 보너스는 추첨 쪽에만 있어 티켓·추첨을 맞바꾸면 2등이 3등이 될 수 있다", () => {
    fc.assert(
      fc.property(lottoDraw, fc.nat(), (draw, i) => {
        // 당첨 번호 하나를 보너스로 바꾼 티켓 = 2등
        const nums = draw.nums.map((n, k) => (k === i % LOTTO_PICK_COUNT ? draw.bonus : n));
        expect(judgeLotto({ nums }, draw).matched_rank).toBe(2);
        // 역할을 맞바꾸면(티켓 ↔ 추첨) 새 보너스는 원래 티켓에 없던 번호라 같은 5개 일치가 3등이 된다
        const otherBonus = lottoNumNotIn([...nums, ...draw.nums]);
        expect(judgeLotto({ nums: draw.nums }, { nums, bonus: otherBonus }).matched_rank).toBe(3);
      }),
    );
  });
});

function lottoNumNotIn(xs: number[]): number {
  for (let n = LOTTO_NUMBER_MIN; n <= LOTTO_NUMBER_MAX; n++) if (!xs.includes(n)) return n;
  throw new Error("unreachable");
}

const digit = fc.constantFrom(..."0123456789");
const sixDigits = fc.string({ unit: digit, minLength: 6, maxLength: 6 });
const group = fc.integer({ min: PENSION_GROUP_MIN, max: PENSION_GROUP_MAX });
const pensionDraw = fc.record({ group_no: group, digits: sixDigits, bonus_digits: sixDigits });

/** 끝에서부터 연속 일치 자리 수. */
function suffixLen(a: string, b: string): number {
  let k = 0;
  while (k < 6 && a[5 - k] === b[5 - k]) k++;
  return k;
}

describe("judgePension — 속성", () => {
  it("등위는 끝자리 연속 일치 길이(와 6자리일 때 조)로만 정해진다", () => {
    fc.assert(
      fc.property(group, sixDigits, pensionDraw, (group_no, digits, draw) => {
        const k = suffixLen(digits, draw.digits);
        const r = judgePension({ group_no, digits }, draw);
        const expected = k === 6 ? (group_no === draw.group_no ? 1 : 2) : k === 0 ? null : 8 - k;
        expect(r.matched_rank).toBe(expected);
      }),
    );
  });

  it("단조성: 끝자리 일치를 한 자리 늘리면 등위가 나빠지지 않는다", () => {
    fc.assert(
      fc.property(group, sixDigits, pensionDraw, (group_no, digits, draw) => {
        const k = suffixLen(digits, draw.digits);
        fc.pre(k < 6);
        const pos = 5 - k;
        const longer = digits.slice(0, pos) + draw.digits[pos] + digits.slice(pos + 1);
        expect(rankScore(judgePension({ group_no, digits: longer }, draw).matched_rank)).toBeLessThan(
          rankScore(judgePension({ group_no, digits }, draw).matched_rank),
        );
      }),
    );
  });

  it("마지막 자리가 다르면 앞 5자리가 모두 같아도 낙첨(접두 일치는 등위가 아니다)", () => {
    fc.assert(
      fc.property(group, pensionDraw, digit, (group_no, draw, d) => {
        fc.pre(d !== draw.digits[5]);
        const digits = draw.digits.slice(0, 5) + d;
        expect(judgePension({ group_no, digits }, draw).matched_rank).toBeNull();
      }),
    );
  });

  // ASSUMPTION(연금 보너스 독립): bonus_hit은 등위·조와 무관하게 digits === bonus_digits.
  it("ASSUMPTION(연금 보너스 독립): bonus_hit은 조·등위와 독립", () => {
    fc.assert(
      fc.property(group, sixDigits, pensionDraw, (group_no, digits, draw) => {
        const r = judgePension({ group_no, digits }, draw);
        expect(r.bonus_hit).toBe(digits === draw.bonus_digits);
        const asBonus = judgePension({ group_no, digits: draw.bonus_digits }, draw);
        expect(asBonus.bonus_hit).toBe(true);
      }),
    );
  });
});
