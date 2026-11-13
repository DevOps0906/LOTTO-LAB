// 인증 입력 규칙·오류 문구(task-043 결정 ④⑤⑥). 비밀번호 규칙은 서버 설정(task-043a config.toml: 8자 이상·letters_digits)과 같다.
import type { AuthFailure } from "../adapters.ts";

export const PASSWORD_MIN = 8;
/** bcrypt 입력 한도(UTF-8 바이트, Supabase는 72바이트를 넘으면 거부). */
export const PASSWORD_MAX = 72;
export const EMAIL_MAX = 254;
export const OTP_PATTERN = /^[0-9]{6}$/;

/** 이메일: 앞뒤 공백 제거·소문자. 형식이 아니면 null. */
export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** 8자 이상(UTF-8 72바이트 이하 — bcrypt 한도는 바이트 기준)·영문과 숫자를 모두 포함. */
export function isValidPassword(value: string): boolean {
  return (
    value.length >= PASSWORD_MIN &&
    new TextEncoder().encode(value).length <= PASSWORD_MAX &&
    /[A-Za-z]/.test(value) &&
    /[0-9]/.test(value)
  );
}

export function isValidOtp(value: string): boolean {
  return OTP_PATTERN.test(value);
}

export type AuthErrorCode =
  | "CREDENTIALS"
  | "INVALID_EMAIL"
  | "WEAK_PASSWORD"
  | "SAME_PASSWORD"
  | "INVALID_CODE"
  | "CONSENT_REQUIRED"
  | "CONSENT_FAILED"
  | "RATE_LIMITED"
  | "OFFLINE"
  | "SESSION_EXPIRED"
  | "REAUTH_REQUIRED"
  | "UNKNOWN";

/**
 * 오류 문구(화면 공용). 로그인 실패·이메일 미확인·이미 가입은 같은 CREDENTIALS 문구 — 계정 존재 여부를 드러내지 않는다(결정 ④).
 */
export const AUTH_MESSAGES: Record<AuthErrorCode, string> = {
  CREDENTIALS: "이메일 또는 비밀번호를 확인해 주세요. 가입 중이라면 메일로 받은 6자리 코드로 가입을 먼저 완료하세요.",
  INVALID_EMAIL: "이메일 주소 형식을 확인해 주세요.",
  WEAK_PASSWORD: `비밀번호는 ${PASSWORD_MIN}자 이상, 영문과 숫자를 함께 써 주세요.`,
  SAME_PASSWORD: "이전과 다른 비밀번호를 입력해 주세요.",
  INVALID_CODE: "코드가 맞지 않거나 만료됐어요. 코드를 다시 받아 입력해 주세요.",
  CONSENT_REQUIRED: "필수 동의 항목을 모두 확인해 주세요.",
  CONSENT_FAILED: "동의 기록을 저장하지 못했어요. 다시 시도해 주세요.",
  RATE_LIMITED: "요청이 많아요. 잠시 후 다시 시도해 주세요.",
  OFFLINE: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  SESSION_EXPIRED: "로그인이 만료됐어요. 다시 로그인해 주세요.",
  REAUTH_REQUIRED: "비밀번호를 확인해 주세요. 계정을 삭제하려면 지금 비밀번호를 다시 입력해야 합니다.",
  UNKNOWN: "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
};

/** 가입 코드 발송 안내(이미 가입된 이메일이어도 같은 문구). */
export const SIGNUP_SENT_MESSAGE = "가입할 수 있는 이메일이면 6자리 코드를 보냈어요. 메일의 코드를 입력하면 가입이 끝납니다.";
/** 재설정 요청은 항상 이 응답(결정 ④ — 이메일 열거 방지). */
export const RESET_SENT_MESSAGE = "가입된 이메일이면 6자리 코드를 보냈어요. 메일이 오지 않으면 주소를 확인하고 잠시 후 다시 요청하세요.";

const CREDENTIAL_CODES = new Set(["invalid_credentials", "email_not_confirmed", "user_already_exists", "email_exists", "user_not_found"]);
const CODE_CODES = new Set(["otp_expired", "otp_disabled", "invalid_otp"]);
const SESSION_CODES = new Set(["session_not_found", "session_expired", "refresh_token_not_found", "refresh_token_already_used", "bad_jwt", "no_authorization"]);

/** Supabase 실패 → 화면 오류 코드. */
export function authErrorCode(failure: AuthFailure): AuthErrorCode {
  const code = failure.code ?? "";
  if (failure.network || failure.status === 0) return "OFFLINE";
  if (failure.status === 429 || code.startsWith("over_")) return "RATE_LIMITED";
  // account-delete: 최근 10분 안의 비밀번호 인증이 없으면 403 REAUTH_REQUIRED(task-043a 계약).
  if (code === "REAUTH_REQUIRED") return "REAUTH_REQUIRED";
  if (CREDENTIAL_CODES.has(code)) return "CREDENTIALS";
  if (code === "weak_password") return "WEAK_PASSWORD";
  if (code === "same_password") return "SAME_PASSWORD";
  if (CODE_CODES.has(code)) return "INVALID_CODE";
  if (code === "email_address_invalid" || code === "validation_failed") return "INVALID_EMAIL";
  if (SESSION_CODES.has(code) || failure.status === 401) return "SESSION_EXPIRED";
  return "UNKNOWN";
}

/** 로그인 뒤 복귀 경로 — 기기 메모리에만 두고(저장·주소 전달 없음) 허용 목록의 경로만 받는다(결정 ⑥). */
export class ReturnToMemory {
  private readonly allowed: ReadonlySet<string>;
  private value: string | null = null;

  constructor(allowed: readonly string[]) {
    this.allowed = new Set(allowed);
  }

  /** 허용 경로면 기억하고 true. 아니면 기억을 비우고 false. 질의(`?a=b`)는 영문·숫자·`=&_-`만 허용. */
  set(path: string): boolean {
    this.value = this.accepts(path) ? path : null;
    return this.value !== null;
  }

  accepts(path: string): boolean {
    if (typeof path !== "string" || path.length > 200) return false;
    const [base = "", query, extra] = path.split("?");
    if (extra !== undefined) return false;
    if (query !== undefined && !/^[A-Za-z0-9=&_-]*$/.test(query)) return false;
    return this.allowed.has(base);
  }

  /** 기억한 경로를 꺼내고 지운다(없으면 "/"). */
  take(): string {
    const path = this.value ?? "/";
    this.value = null;
    return path;
  }
}
