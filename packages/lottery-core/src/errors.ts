// 엔진 오류 타입(04#1 A-04·A-05 메모). 생성 조건 조합 불가는 HTTP 409가 아니라 기기에서 이 오류로 처리한다.
// hint는 화면이 해결 방안 문구를 고르는 키(문구 자체는 UI 소유). 예: "lotto.fixed_excluded_overlap".

export const ENGINE_ERROR_CODES = ["IMPOSSIBLE_COMBINATION", "INVALID_INPUT"] as const;
export type EngineErrorCode = (typeof ENGINE_ERROR_CODES)[number];

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly hint: string;
  /** 해결 안내에 쓰는 수치(예: { max: 8, requested: 9 }). 문구는 UI 소유. */
  readonly detail?: Record<string, number>;

  constructor(code: EngineErrorCode, hint: string, message?: string, detail?: Record<string, number>) {
    super(message ?? `${code}: ${hint}`);
    this.name = "EngineError";
    this.code = code;
    this.hint = hint;
    if (detail !== undefined) this.detail = detail;
  }
}

export function isEngineError(value: unknown): value is EngineError {
  return value instanceof EngineError;
}

/** 입력 전제 위반 — 판정·Rng·날짜 함수가 공통으로 던진다. */
export function invalidInput(hint: string): EngineError {
  return new EngineError("INVALID_INPUT", hint);
}
