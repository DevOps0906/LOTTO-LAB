// 오류 응답 `{error:{code,message}}`(04#2).
import { z } from "zod";
import { ERROR_CODES } from "@lotto-lab/types";

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export const ErrorResponseSchema = z.object({
  error: z.object({ code: ErrorCodeSchema, message: z.string() }),
});
