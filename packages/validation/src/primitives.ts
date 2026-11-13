// 공용 원시 스키마: 정수 범위·날짜(YYYY-MM-DD)·시각(오프셋 포함 ISO)·연금 6자리 문자열·로또 번호 6개.
import { z } from "zod";
import {
  LOTTO_NUMBER_MAX,
  LOTTO_NUMBER_MIN,
  INT4_MAX,
  INT4_MIN,
  LOTTO_PICK_COUNT,
  PENSION_DIGITS_PATTERN,
  PENSION_GROUP_MAX,
  PENSION_GROUP_MIN,
} from "@lotto-lab/types";

export const intRange = (min: number, max: number) => z.int().min(min).max(max);
/** Postgres int4 열(round·draw_no·range_*·sample_size)에 들어가는 정수. */
export const int4 = (min: number = INT4_MIN) => intRange(min, INT4_MAX);

const isStrictlyAscending = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]);
const hasNoDuplicates = (xs: unknown[]) => new Set(xs).size === xs.length;

/** 목록 안 중복 없음(순서 무관). */
export const uniqueList = <T extends z.ZodType>(item: T, min: number, max: number) =>
  z.array(item).min(min).max(max).refine(hasNoDuplicates, "중복된 값이 있습니다.");

export const lottoNumber = intRange(LOTTO_NUMBER_MIN, LOTTO_NUMBER_MAX);

/** 로또 번호 6개: 정수 1~45, 엄격 오름차순(= 중복 없음). 정렬해 주지 않는다 — DB CHECK와 같은 판정. */
export const lottoNums = z
  .array(lottoNumber)
  .length(LOTTO_PICK_COUNT)
  .refine(isStrictlyAscending, "번호는 중복 없이 오름차순이어야 합니다.");

/** 연금 6자리: 문자열만(number 거부, 변환 없음 — 앞자리 0 보존). */
export const pensionDigits = z.string().regex(new RegExp(PENSION_DIGITS_PATTERN), "6자리 숫자 문자열이어야 합니다.");
export const pensionGroup = intRange(PENSION_GROUP_MIN, PENSION_GROUP_MAX);

function isExistingDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= days;
}

/** 날짜 `YYYY-MM-DD` 문자열(강제 변환 없음, 존재하는 날짜만). */
export const isoDate = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "YYYY-MM-DD 형식이어야 합니다.")
  .refine(isExistingDate, "존재하지 않는 날짜입니다.");

/** 시각: 오프셋(Z 또는 ±hh:mm) 포함 ISO 8601 문자열. */
export const isoDateTime = z.iso.datetime({ offset: true });
