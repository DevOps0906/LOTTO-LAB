// app-core 오류. 문구는 UI 소유 — code로 분기한다. 엔진 조건 오류는 lottery-core EngineError를 그대로 전달한다.

export const APP_CORE_ERROR_CODES = [
  "INVALID_INPUT",
  "INVALID_CONFIG",
  "NOT_FOUND",
  "INVALID_TRANSITION",
  "IDEMPOTENCY_CONFLICT",
  "LIMIT_EXCEEDED",
  "STORAGE_FAILED",
] as const;
export type AppCoreErrorCode = (typeof APP_CORE_ERROR_CODES)[number];

export class AppCoreError extends Error {
  readonly code: AppCoreErrorCode;

  constructor(code: AppCoreErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options);
    this.name = "AppCoreError";
    this.code = code;
  }
}

export function isAppCoreError(value: unknown): value is AppCoreError {
  return value instanceof AppCoreError;
}
