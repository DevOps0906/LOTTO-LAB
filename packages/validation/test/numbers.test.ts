// 번호·티켓 스키마 단위·속성 테스트(task-011 완료 조건: "000719" 왕복, 719 거부, 중복 거부).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  LOTTO_NUMBER_MAX,
  LOTTO_NUMBER_MIN,
  LOTTO_PICK_COUNT,
  PENSION_GROUP_MAX,
  PENSION_GROUP_MIN,
} from "@lotto-lab/types";
import {
  LottoNumbersSchema,
  LottoTicketSchema,
  PensionNumbersSchema,
  PensionTicketSchema,
} from "../src/index.ts";

const lottoNum = fc.integer({ min: LOTTO_NUMBER_MIN, max: LOTTO_NUMBER_MAX });
/** 정상 로또 번호: 1~45에서 서로 다른 6개, 오름차순. */
const validNums = fc
  .uniqueArray(lottoNum, { minLength: LOTTO_PICK_COUNT, maxLength: LOTTO_PICK_COUNT })
  .map((xs) => [...xs].sort((a, b) => a - b));
const sixDigits = fc.string({ unit: fc.constantFrom(..."0123456789"), minLength: 6, maxLength: 6 });

describe("연금 digits — 문자열만, 앞자리 0 보존", () => {
  it('"000719"는 통과하고 JSON 왕복 뒤에도 "000719"다', () => {
    const parsed = PensionTicketSchema.parse({ group_no: 1, digits: "000719" });
    expect(parsed.digits).toBe("000719");
    const again = PensionTicketSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(again).toStrictEqual({ group_no: 1, digits: "000719" });
  });

  it("719(number)는 거부한다(숫자 변환 금지)", () => {
    expect(PensionNumbersSchema.safeParse({ digits: 719 }).success).toBe(false);
    expect(PensionTicketSchema.safeParse({ group_no: 1, digits: 719 }).success).toBe(false);
  });

  it("속성: 6자리 숫자 문자열은 모두 통과하고 값이 그대로다", () => {
    fc.assert(
      fc.property(sixDigits, fc.integer({ min: PENSION_GROUP_MIN, max: PENSION_GROUP_MAX }), (digits, group_no) => {
        expect(PensionNumbersSchema.parse({ digits })).toStrictEqual({ digits });
        expect(PensionTicketSchema.parse({ group_no, digits })).toStrictEqual({ group_no, digits });
      }),
    );
  });

  it("속성: number 형 digits는 어떤 값이든 거부한다", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer({ min: 0, max: 999_999 }), fc.double()), (digits) => {
        expect(PensionNumbersSchema.safeParse({ digits }).success).toBe(false);
      }),
    );
  });

  it("속성: 6자리 ASCII 숫자가 아닌 문자열은 거부한다", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "binary" }).filter((s) => !/^[0-9]{6}$/.test(s)),
        (digits) => {
          expect(PensionNumbersSchema.safeParse({ digits }).success).toBe(false);
        },
      ),
    );
  });

  it("속성: 조는 1~5 정수만", () => {
    fc.assert(
      fc.property(fc.integer(), sixDigits, (group_no, digits) => {
        const ok = group_no >= PENSION_GROUP_MIN && group_no <= PENSION_GROUP_MAX;
        expect(PensionTicketSchema.safeParse({ group_no, digits }).success).toBe(ok);
      }),
    );
  });
});

describe("로또 nums — 정수 1~45, 6개, 오름차순, 중복 없음, 추가 키 금지", () => {
  it("중복 번호를 거부한다", () => {
    expect(LottoTicketSchema.safeParse({ nums: [1, 2, 3, 3, 4, 5] }).success).toBe(false);
  });

  it("추가 키를 거부한다(strict)", () => {
    expect(LottoNumbersSchema.safeParse({ nums: [1, 2, 3, 4, 5, 6], bonus: 7 }).success).toBe(false);
  });

  it("속성: 정상 번호는 모두 통과하고 값이 그대로다", () => {
    fc.assert(
      fc.property(validNums, (nums) => {
        expect(LottoNumbersSchema.parse({ nums })).toStrictEqual({ nums });
        expect(LottoTicketSchema.parse({ nums })).toStrictEqual({ nums });
      }),
    );
  });

  it("속성: 오름차순이 아닌 순열은 거부한다(정렬해 주지 않음)", () => {
    fc.assert(
      fc.property(validNums.chain((nums) => fc.shuffledSubarray(nums, { minLength: 6, maxLength: 6 })), (nums) => {
        const sorted = nums.every((x, i) => i === 0 || x > nums[i - 1]);
        expect(LottoNumbersSchema.safeParse({ nums }).success).toBe(sorted);
      }),
    );
  });

  it("속성: 한 자리를 앞 번호로 바꿔 중복을 만들면 거부한다", () => {
    fc.assert(
      fc.property(validNums, fc.integer({ min: 1, max: 5 }), (nums, i) => {
        const dup = [...nums];
        dup[i] = dup[i - 1];
        expect(LottoNumbersSchema.safeParse({ nums: dup }).success).toBe(false);
      }),
    );
  });

  it("속성: 범위 밖 정수가 하나라도 있으면 거부한다", () => {
    fc.assert(
      fc.property(
        validNums,
        fc.integer({ min: 0, max: 5 }),
        fc.oneof(fc.integer({ max: LOTTO_NUMBER_MIN - 1 }), fc.integer({ min: LOTTO_NUMBER_MAX + 1 })),
        (nums, i, bad) => {
          const out = [...nums];
          out[i] = bad;
          expect(LottoNumbersSchema.safeParse({ nums: out }).success).toBe(false);
        },
      ),
    );
  });

  it("속성: 개수가 6이 아니면 거부한다", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(lottoNum, { maxLength: 10 }).filter((xs) => xs.length !== LOTTO_PICK_COUNT),
        (xs) => {
          const nums = [...xs].sort((a, b) => a - b);
          expect(LottoNumbersSchema.safeParse({ nums }).success).toBe(false);
        },
      ),
    );
  });

  it("속성: 정수가 아닌 값(실수·문자열)이 섞이면 거부한다", () => {
    fc.assert(
      fc.property(
        validNums,
        fc.integer({ min: 0, max: 5 }),
        fc.oneof(
          fc.double({ min: 1, max: 45, noNaN: true }).filter((x) => !Number.isInteger(x)),
          fc.integer({ min: 1, max: 45 }).map(String),
        ),
        (nums, i, bad) => {
          const out: unknown[] = [...nums];
          out[i] = bad;
          expect(LottoNumbersSchema.safeParse({ nums: out }).success).toBe(false);
        },
      ),
    );
  });
});
