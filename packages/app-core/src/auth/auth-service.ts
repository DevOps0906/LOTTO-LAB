// 로그인·가입·재설정·계정 삭제(task-043). 이메일+비밀번호, 가입 확인·재설정은 메일의 6자리 코드(결정 ①).
// 세션 토큰은 다루지 않는다 — AuthClient(셸)가 보안 저장소에 둔다. 로그인 전 로컬 번호는 서버로 보내지 않는다.
// 동의 게이트: 본인 user_consents 기록이 확인되기 전에는 consentRequired(회원 기능은 signedIn만 허용).
import type { AuthClient, AuthFailure, AuthUser, ConsentRecord } from "../adapters.ts";
import {
  AUTH_MESSAGES,
  RESET_SENT_MESSAGE,
  ReturnToMemory,
  SIGNUP_SENT_MESSAGE,
  authErrorCode,
  isValidOtp,
  isValidPassword,
  normalizeEmail,
  type AuthErrorCode,
} from "./rules.ts";

/**
 * 인증 상태. unavailable = 기기 저장소를 읽지 못함(조용히 로그아웃하지 않는다 — retry로 다시 확인).
 * consentRequired = 로그인은 됐지만 동의 기록이 없거나 확인하지 못함(checkFailed = 조회 실패, 재시도 안내).
 */
export type AuthState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "signedOut" }
  | { status: "consentRequired"; user: AuthUser; checkFailed: boolean }
  | { status: "signedIn"; user: AuthUser };

export type AuthField = "email" | "password" | "code" | "consent";
export type AuthOutcome =
  | { ok: true; message?: string }
  | { ok: false; code: AuthErrorCode; message: string; field?: AuthField };

/** 가입 동의(화면 체크 3개). 모두 true여야 가입할 수 있다. */
export type ConsentInput = { terms: boolean; privacy: boolean; adult: boolean };

/** 현재 약관·개인정보 처리방침 버전(user_consents에 기록). 문서 개정 시 올린다. */
export const CONSENT_VERSIONS = { terms: "2026-11-13", privacy: "2026-11-13" } as const;

const fail = (code: AuthErrorCode, field?: AuthField): AuthOutcome => ({ ok: false, code, message: AUTH_MESSAGES[code], ...(field ? { field } : {}) });
const fromFailure = (failure: AuthFailure, field?: AuthField): AuthOutcome => fail(authErrorCode(failure), field);
/** 가입·코드 재발송에서 '보냈어요'와 같은 응답으로 바꾸는 오류(이미 가입·발송 제한 — 이메일 열거 방지, 재설정과 같게). */
const SENT_ANYWAY: ReadonlySet<AuthErrorCode> = new Set(["CREDENTIALS", "RATE_LIMITED"]);

export class AuthService {
  readonly returnTo: ReturnToMemory;
  private readonly client: AuthClient;
  private current: AuthState = { status: "loading" };
  private readonly listeners = new Set<(state: AuthState) => void>();
  private initPromise: Promise<AuthState> | null = null;
  /** 늦게 끝난 상태 확인이 더 새 상태를 덮지 않게 하는 순번. */
  private seq = 0;

  constructor(client: AuthClient, options: { returnPaths?: readonly string[] } = {}) {
    this.client = client;
    this.returnTo = new ReturnToMemory(options.returnPaths ?? ["/"]);
    client.onChange((user) => {
      // 로그인 계열은 각 메서드가 load()로 동의까지 확인한다. 여기서는 세션 소멸(만료·다른 경로 로그아웃)만 반영한다.
      if (user === null && (this.current.status === "signedIn" || this.current.status === "consentRequired")) {
        this.commit({ status: "signedOut" });
      }
    });
  }

  state(): AuthState {
    return this.current;
  }

  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 저장된 세션·동의 기록을 확인한다(한 번만). 저장소 읽기 실패는 unavailable(결정 ③ — 복호화 실패 정리는 셸이 한다). */
  init(): Promise<AuthState> {
    this.initPromise ??= this.load();
    return this.initPromise;
  }

  /** unavailable·동의 조회 실패 뒤 다시 확인. */
  retry(): Promise<AuthState> {
    this.initPromise = this.load();
    return this.initPromise;
  }

  /** 가입: 이메일·비밀번호·필수 동의 확인 → 메일로 6자리 코드. 이미 가입된 이메일도 같은 결과(이메일 열거 방지). */
  async signUp(emailInput: string, password: string, consent: ConsentInput): Promise<AuthOutcome> {
    const email = normalizeEmail(emailInput);
    if (!email) return fail("INVALID_EMAIL", "email");
    if (!isValidPassword(password)) return fail("WEAK_PASSWORD", "password");
    if (!consentGiven(consent)) return fail("CONSENT_REQUIRED", "consent");
    const failure = await this.client.signUp(email, password);
    if (failure && !SENT_ANYWAY.has(authErrorCode(failure))) return fromFailure(failure);
    return { ok: true, message: SIGNUP_SENT_MESSAGE };
  }

  async resendSignup(emailInput: string): Promise<AuthOutcome> {
    const email = normalizeEmail(emailInput);
    if (!email) return fail("INVALID_EMAIL", "email");
    const failure = await this.client.resendSignup(email);
    if (failure && !SENT_ANYWAY.has(authErrorCode(failure))) return fromFailure(failure);
    return { ok: true, message: SIGNUP_SENT_MESSAGE };
  }

  /**
   * 가입 코드 확인 → 동의 확인 → 동의 기록. 코드는 한 번만 쓴다 — 기록 실패(오프라인·429 포함)는 consentRequired로 남기고
   * recordConsent로 다시 시도한다(코드 재검증 없음).
   */
  async verifySignup(emailInput: string, code: string, consent: ConsentInput): Promise<AuthOutcome> {
    const email = normalizeEmail(emailInput);
    if (!email) return fail("INVALID_EMAIL", "email");
    if (!consentGiven(consent)) return fail("CONSENT_REQUIRED", "consent");
    const token = code.trim();
    if (!isValidOtp(token)) return fail("INVALID_CODE", "code");
    const failure = await this.client.verifyOtp(email, token, "signup");
    if (failure) return fromFailure(failure, "code");
    const state = await this.load();
    if (state.status === "signedIn") return { ok: true };
    if (state.status !== "consentRequired") return fail(state.status === "unavailable" ? "UNKNOWN" : "SESSION_EXPIRED");
    return this.recordConsent(consent);
  }

  /** 로그인한 사용자의 동의를 기록한다(consentRequired → signedIn). */
  async recordConsent(consent: ConsentInput): Promise<AuthOutcome> {
    if (!consentGiven(consent)) return fail("CONSENT_REQUIRED", "consent");
    const s = this.current;
    const user = s.status === "signedIn" || s.status === "consentRequired" ? s.user : null;
    if (!user) return fail("SESSION_EXPIRED");
    const record: ConsentRecord = { terms_version: CONSENT_VERSIONS.terms, privacy_version: CONSENT_VERSIONS.privacy, adult_confirmed: true };
    const failure = await this.client.insertConsent(user.id, record);
    if (!failure) {
      if (this.sameUser(user)) this.commit({ status: "signedIn", user });
      return { ok: true };
    }
    const code = authErrorCode(failure);
    return fail(code === "OFFLINE" || code === "SESSION_EXPIRED" || code === "RATE_LIMITED" ? code : "CONSENT_FAILED", "consent");
  }

  /**
   * 로그인. 성공해도 동의 기록이 없으면 consentRequired(ok — 화면이 동의 단계를 보인다).
   * 화면은 최종 상태가 signedIn일 때만 원래 화면으로 돌아간다. 상태를 확인하지 못하면(unavailable) 실패로 재시도 안내.
   */
  async signIn(emailInput: string, password: string): Promise<AuthOutcome> {
    const email = normalizeEmail(emailInput);
    // 형식 오류는 계정 존재와 무관하므로 따로 안내한다.
    if (!email) return fail("INVALID_EMAIL", "email");
    if (password.length === 0) return fail("CREDENTIALS", "password");
    const failure = await this.client.signIn(email, password);
    if (failure) {
      const code = authErrorCode(failure);
      // 비밀번호 규칙 위반·미확인·없는 계정 등은 모두 같은 문구(결정 ④).
      return fail(code === "OFFLINE" || code === "RATE_LIMITED" ? code : "CREDENTIALS");
    }
    return settled(await this.load());
  }

  /** 재설정 코드 요청 — 형식 오류·연결 끊김 외에는 항상 같은 응답(결정 ④). */
  async requestReset(emailInput: string): Promise<AuthOutcome> {
    const email = normalizeEmail(emailInput);
    if (!email) return fail("INVALID_EMAIL", "email");
    const failure = await this.client.requestReset(email);
    if (failure && authErrorCode(failure) === "OFFLINE") return fail("OFFLINE");
    return { ok: true, message: RESET_SENT_MESSAGE };
  }

  /** 재설정 코드 확인 → 새 비밀번호 저장. 저장에 실패하면 코드로 열린 세션을 이 기기에서 지운다(재요청 필요). */
  async confirmReset(emailInput: string, code: string, newPassword: string): Promise<AuthOutcome> {
    const email = normalizeEmail(emailInput);
    if (!email) return fail("INVALID_EMAIL", "email");
    const token = code.trim();
    if (!isValidOtp(token)) return fail("INVALID_CODE", "code");
    if (!isValidPassword(newPassword)) return fail("WEAK_PASSWORD", "password");
    const verify = await this.client.verifyOtp(email, token, "recovery");
    if (verify) return fromFailure(verify, "code");
    const update = await this.client.updatePassword(newPassword);
    if (update) {
      const out = await this.signOut();
      return out.ok ? fromFailure(update, "password") : out;
    }
    return settled(await this.load());
  }

  /**
   * 이 기기에서 로그아웃(scope local). 서버 호출이 실패해도 저장 값을 지운다(결정 ③).
   * 저장 값을 지우지 못하면 로그아웃했다고 하지 않는다(상태 유지 + UNKNOWN — 다시 시도).
   */
  async signOut(): Promise<AuthOutcome> {
    try {
      await this.client.signOut();
    } catch {
      // 연결 끊김 등 — 아래에서 로컬 세션을 지운다.
    }
    try {
      await this.client.clearLocalSession();
    } catch {
      return fail("UNKNOWN");
    }
    this.commit({ status: "signedOut" });
    return { ok: true };
  }

  /**
   * 계정 삭제: 비밀번호 재입력 → 같은 이메일로 다시 로그인(재인증) → account-delete Edge Function → 로컬 세션 삭제.
   * 서버는 최근 10분 안의 비밀번호 인증이 없으면 403 REAUTH_REQUIRED. 비밀번호 오류와 같은 문구로 재입력을 안내한다.
   * 동의 전(consentRequired)에도 삭제할 수 있다.
   */
  async deleteAccount(password: string): Promise<AuthOutcome> {
    const s = this.current;
    const user = s.status === "signedIn" || s.status === "consentRequired" ? s.user : null;
    if (!user?.email) return fail("SESSION_EXPIRED");
    if (password.length === 0) return fail("REAUTH_REQUIRED", "password");
    const reauth = await this.client.signIn(user.email, password);
    if (reauth) {
      const code = authErrorCode(reauth);
      return fail(code === "OFFLINE" || code === "RATE_LIMITED" ? code : "REAUTH_REQUIRED", "password");
    }
    const failure = await this.client.deleteAccount();
    if (failure) {
      const code = authErrorCode(failure);
      if (code === "SESSION_EXPIRED") {
        const out = await this.signOut();
        return out.ok ? fail(code) : out;
      }
      if (code === "REAUTH_REQUIRED") return fail(code, "password");
      return fail(code === "OFFLINE" || code === "RATE_LIMITED" ? code : "UNKNOWN");
    }
    // 서버 계정은 이미 삭제됐다. 로컬 정리 실패는 오류로 알려 다시 로그아웃을 시도하게 한다.
    return this.signOut();
  }

  /** 세션 사용자 → 동의 기록 확인 → 상태. 더 새 상태 변경이 있었으면 결과를 버린다. */
  private async load(): Promise<AuthState> {
    const seq = ++this.seq;
    let next: AuthState;
    try {
      const user = await this.client.getUser();
      next = user ? await this.consentState(user) : { status: "signedOut" };
    } catch {
      next = { status: "unavailable" };
    }
    if (seq === this.seq) this.setState(next);
    return this.current;
  }

  private async consentState(user: AuthUser): Promise<AuthState> {
    try {
      const versions = { terms_version: CONSENT_VERSIONS.terms, privacy_version: CONSENT_VERSIONS.privacy };
      return (await this.client.hasConsent(user.id, versions)) ? { status: "signedIn", user } : { status: "consentRequired", user, checkFailed: false };
    } catch {
      return { status: "consentRequired", user, checkFailed: true };
    }
  }

  private sameUser(user: AuthUser): boolean {
    const s = this.current;
    return (s.status === "signedIn" || s.status === "consentRequired") && s.user.id === user.id;
  }

  /** 즉시 상태 변경(진행 중인 load 결과는 버린다). */
  private commit(next: AuthState): void {
    this.seq++;
    this.setState(next);
  }

  private setState(next: AuthState): void {
    this.current = next;
    for (const listener of this.listeners) listener(next);
  }
}

/** 로그인 계열 성공 뒤 최종 상태 → 결과. signedIn·consentRequired만 성공(동의 단계는 화면이 보인다). */
function settled(state: AuthState): AuthOutcome {
  if (state.status === "signedIn" || state.status === "consentRequired") return { ok: true };
  return fail(state.status === "signedOut" ? "SESSION_EXPIRED" : "UNKNOWN");
}

function consentGiven(consent: ConsentInput): boolean {
  return consent.terms === true && consent.privacy === true && consent.adult === true;
}
