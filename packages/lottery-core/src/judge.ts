// 당첨 판정(기기·서버 공용, 순수 함수). 결과 표현은 draw_checks(05#2)와 같다:
// 낙첨 = matched_rank null + bonus_hit false. 로또 bonus_hit은 항상 false(로또 2등은 rank 2).
// 회차 데이터는 호출자가 명시적으로 넘긴다(회차 계산·saved_tickets.round NULL 처리는 호출자 책임).
import {
  LOTTO_NUMBER_MAX,
  LOTTO_NUMBER_MIN,
  LOTTO_PICK_COUNT,
  PENSION_DIGITS_PATTERN,
  PENSION_GROUP_MAX,
  PENSION_GROUP_MIN,
} from "@lotto-lab/types";
import type { DrawLotto, DrawPension, LottoTicket, PensionTicket } from "@lotto-lab/types";
import { invalidInput } from "./errors.ts";

/** draw_checks의 matched_rank·bonus_hit과 같은 모양. */
export type JudgeResult = { matched_rank: number | null; bonus_hit: boolean };

export type LottoDrawInput = Pick<DrawLotto, "nums" | "bonus">;
export type PensionDrawInput = Pick<DrawPension, "group_no" | "digits" | "bonus_digits">;

const DIGITS_RE = new RegExp(PENSION_DIGITS_PATTERN);

function isLottoNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= LOTTO_NUMBER_MIN && n <= LOTTO_NUMBER_MAX;
}

/** 정수 6개, 1~45, 중복 없음(순서는 보지 않는다 — 게스트 로컬 데이터는 DB CHECK를 거치지 않음). */
function assertLottoNums(nums: unknown, hint: string): asserts nums is number[] {
  if (!Array.isArray(nums) || nums.length !== LOTTO_PICK_COUNT || !nums.every(isLottoNumber)) throw invalidInput(hint);
  if (new Set(nums).size !== nums.length) throw invalidInput(hint);
}

function assertGroup(groupNo: unknown, hint: string): void {
  const ok =
    typeof groupNo === "number" && Number.isInteger(groupNo) && groupNo >= PENSION_GROUP_MIN && groupNo <= PENSION_GROUP_MAX;
  if (!ok) throw invalidInput(hint);
}

function assertDigits(digits: unknown, hint: string): void {
  if (typeof digits !== "string" || !DIGITS_RE.test(digits)) throw invalidInput(hint);
}

/** 로또 6/45: 1등 6개, 2등 5개+보너스, 3등 5개, 4등 4개, 5등 3개 일치. */
export function judgeLotto(ticket: LottoTicket, draw: LottoDrawInput): JudgeResult {
  assertLottoNums(ticket?.nums, "ticket.nums");
  assertLottoNums(draw?.nums, "draw.nums");
  if (!isLottoNumber(draw.bonus) || draw.nums.includes(draw.bonus)) throw invalidInput("draw.bonus");

  const drawn = new Set(draw.nums);
  const matched = ticket.nums.filter((n) => drawn.has(n)).length;
  const bonus = ticket.nums.includes(draw.bonus);

  let rank: number | null = null;
  if (matched === 6) rank = 1;
  else if (matched === 5) rank = bonus ? 2 : 3;
  else if (matched === 4) rank = 4;
  else if (matched === 3) rank = 5;
  return { matched_rank: rank, bonus_hit: false };
}

/** 두 6자리 문자열의 끝에서부터 연속 일치하는 자리 수(0~6). */
function trailingMatch(a: string, b: string): number {
  let k = 0;
  while (k < a.length && a[a.length - 1 - k] === b[b.length - 1 - k]) k++;
  return k;
}

/**
 * 연금복권 720+: 1등 조+6자리, 2등 6자리(조 불일치), 3~7등 끝 5~1자리 연속 일치.
 * 보너스는 bonus_digits 6자리 일치(조 무관)이며 등위와 독립 판정 — 동시 당첨 허용.
 * ASSUMPTION(연금 보너스 독립): 공식 규정 미확인 가정(task-012 결정 ③). 확인되면 이 함수와 테스트를 갱신한다.
 */
export function judgePension(ticket: PensionTicket, draw: PensionDrawInput): JudgeResult {
  assertGroup(ticket?.group_no, "ticket.group_no");
  assertDigits(ticket.digits, "ticket.digits");
  assertGroup(draw?.group_no, "draw.group_no");
  assertDigits(draw.digits, "draw.digits");
  assertDigits(draw.bonus_digits, "draw.bonus_digits");

  const k = trailingMatch(ticket.digits, draw.digits);
  let rank: number | null = null;
  if (k === 6) rank = ticket.group_no === draw.group_no ? 1 : 2;
  else if (k > 0) rank = 8 - k; // 끝 5자리 → 3등 … 끝 1자리 → 7등
  return { matched_rank: rank, bonus_hit: ticket.digits === draw.bonus_digits };
}
