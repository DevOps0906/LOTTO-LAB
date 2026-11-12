// 생성 조건 입력 스키마 — 범위만 검사. 불가능한 조합(고정·제외 겹침 등)은 엔진 IMPOSSIBLE_COMBINATION.
import { z } from "zod";
import {
  GAMES_PER_REQUEST_MAX,
  GAMES_PER_REQUEST_MIN,
  LOTTO_EXCLUDED_MAX,
  LOTTO_FIXED_MAX,
  PENSION_DIGITS_LENGTH,
  PENSION_GROUP_MAX,
} from "@lotto-lab/types";
import { intRange, lottoNumber, pensionGroup, uniqueList } from "./primitives.ts";

const games = intRange(GAMES_PER_REQUEST_MIN, GAMES_PER_REQUEST_MAX);

export const LottoGeneratorConfigSchema = z.strictObject({
  fixed: uniqueList(lottoNumber, 0, LOTTO_FIXED_MAX),
  excluded: uniqueList(lottoNumber, 0, LOTTO_EXCLUDED_MAX),
  games,
});

export const PensionGeneratorConfigSchema = z.strictObject({
  groups: uniqueList(pensionGroup, 1, PENSION_GROUP_MAX),
  positions: z
    .array(z.string().regex(/^[0-9]$/, "자리 값은 숫자 한 글자 문자열이어야 합니다.").nullable())
    .length(PENSION_DIGITS_LENGTH),
  games,
});
