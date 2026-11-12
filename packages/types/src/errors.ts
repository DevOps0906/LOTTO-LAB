// 공통 오류 응답(04#2). 코드 목록은 04#2 표와 1:1 — 표를 바꾸면 이 파일도 함께 바꾼다(검증 패키지 테스트가 대조).

export const ERROR_CODES = [
  "INVALID_INPUT",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "MFA_REQUIRED",
  "NOT_FOUND",
  "INVALID_SOURCE_NUMBER",
  "IDEMPOTENCY_CONFLICT",
  "ALREADY_PROCESSED",
  "NOT_REVERIFIED",
  "INVALID_TRANSITION",
  "RATE_LIMITED",
  "DATA_STALE",
  "SERVICE_UNAVAILABLE",
  "INTERNAL",
  "METHOD_NOT_ALLOWED",
  "SOURCE_UNAVAILABLE",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  MFA_REQUIRED: 403,
  NOT_FOUND: 404,
  INVALID_SOURCE_NUMBER: 400,
  IDEMPOTENCY_CONFLICT: 409,
  ALREADY_PROCESSED: 409,
  NOT_REVERIFIED: 409,
  INVALID_TRANSITION: 422,
  RATE_LIMITED: 429,
  DATA_STALE: 503,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
  METHOD_NOT_ALLOWED: 405,
  SOURCE_UNAVAILABLE: 503,
};

/** `{ "error": { "code", "message" } }` — message는 사용자 표시용 한국어. */
export type ErrorResponse = { error: { code: ErrorCode; message: string } };
