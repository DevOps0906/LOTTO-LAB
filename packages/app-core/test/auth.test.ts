// task-043 인증 서비스 단위 테스트: 오류 문구 통일·비밀번호 규칙·returnTo 허용 목록·복호화 실패·로컬 로그아웃·동의 기록·계정 삭제.
import { describe, expect, it, vi } from "vitest";
import {
  AUTH_MESSAGES,
  AuthService,
  CONSENT_VERSIONS,
  RESET_SENT_MESSAGE,
  ReturnToMemory,
  isValidPassword,
  normalizeEmail,
  type AuthClient,
  type AuthFailure,
  type AuthUser,
} from "../src/index.ts";

const USER: AuthUser = { id: "00000000-0000-4000-8000-000000000001", email: "a@example.com" };
const ALL = { terms: true, privacy: true, adult: true };

/** consented = 서버 user_consents 본인 행 유무(가입 흐름 테스트는 false로 시작). */
function fakeClient(initial: AuthUser | null = null, consented = true) {
  let user = initial;
  let hasRow = consented;
  let listener: ((u: AuthUser | null) => void) | null = null;
  const ok = async (): Promise<AuthFailure | null> => null;
  const client = {
    getUser: vi.fn(async () => user),
    onChange: vi.fn((l: (u: AuthUser | null) => void) => {
      listener = l;
      return () => {};
    }),
    signUp: vi.fn(ok),
    resendSignup: vi.fn(ok),
    verifyOtp: vi.fn(async (): Promise<AuthFailure | null> => {
      user = USER;
      return null;
    }),
    signIn: vi.fn(async (): Promise<AuthFailure | null> => {
      user = USER;
      return null;
    }),
    requestReset: vi.fn(ok),
    updatePassword: vi.fn(ok),
    insertConsent: vi.fn(async (): Promise<AuthFailure | null> => {
      hasRow = true;
      return null;
    }),
    hasConsent: vi.fn(async () => hasRow),
    deleteAccount: vi.fn(ok),
    signOut: vi.fn(async () => {}),
    clearLocalSession: vi.fn(async () => {
      user = null;
    }),
  } satisfies AuthClient;
  return { client, emit: (u: AuthUser | null) => listener?.(u), setUser: (u: AuthUser | null) => (user = u) };
}

const failure = (code: string | null, status: number | null = 400, network = false): AuthFailure => ({ code, status, network });

describe("입력 규칙", () => {
  it("비밀번호: 8자 이상·영문+숫자(서버 letters_digits와 같음), 72자 초과 거부", () => {
    expect(isValidPassword("abcd1234")).toBe(true);
    expect(isValidPassword("Abc12345")).toBe(true);
    expect(isValidPassword("abc1234")).toBe(false); // 7자
    expect(isValidPassword("abcdefgh")).toBe(false); // 숫자 없음
    expect(isValidPassword("12345678")).toBe(false); // 영문 없음
    expect(isValidPassword("한글비밀번호1234")).toBe(false); // 영문 없음
    expect(isValidPassword(`a1${"x".repeat(70)}`)).toBe(true);
    expect(isValidPassword(`a1${"x".repeat(71)}`)).toBe(false);
    // 72바이트 기준(bcrypt): 한글 1자 = 3바이트
    expect(isValidPassword(`a1${"가".repeat(23)}`)).toBe(true); // 2 + 69 = 71바이트
    expect(isValidPassword(`a1${"가".repeat(24)}`)).toBe(false); // 2 + 72 = 74바이트(26자)
  });

  it("이메일: 공백 제거·소문자, 형식 오류는 null", () => {
    expect(normalizeEmail("  A@Example.COM ")).toBe("a@example.com");
    expect(normalizeEmail("no-at.example.com")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });
});

describe("returnTo 허용 목록(기기 메모리)", () => {
  const memory = () => new ReturnToMemory(["/", "/settings", "/tickets", "/generate/theme"]);

  it("허용 경로만 기억하고 take()로 한 번만 꺼낸다", () => {
    const r = memory();
    expect(r.set("/settings")).toBe(true);
    expect(r.take()).toBe("/settings");
    expect(r.take()).toBe("/");
    expect(r.set("/tickets?tab=purchased")).toBe(true);
    expect(r.take()).toBe("/tickets?tab=purchased");
  });

  it.each([
    "https://evil.example/",
    "//evil.example",
    "/settings/../admin",
    "javascript:alert(1)",
    "/unknown",
    "settings",
    "/tickets?x=<script>",
    "/tickets?a=1?b=2",
    "/\\evil",
  ])("거부: %s → 기본 경로", (path) => {
    const r = memory();
    r.set("/settings");
    expect(r.set(path)).toBe(false);
    expect(r.take()).toBe("/");
  });
});

describe("AuthService", () => {
  it("저장소 복호화 실패는 셸이 지우고 null → 로그아웃 상태", async () => {
    const f = fakeClient(null);
    const auth = new AuthService(f.client);
    expect(auth.state().status).toBe("loading");
    expect(await auth.init()).toEqual({ status: "signedOut" });
  });

  it("저장소 읽기 실패(getUser throw) → unavailable(조용히 로그아웃하지 않음), retry로 다시 확인", async () => {
    const f = fakeClient(USER);
    f.client.getUser.mockRejectedValueOnce(new Error("io"));
    const auth = new AuthService(f.client);
    expect(await auth.init()).toEqual({ status: "unavailable" });
    expect(f.client.clearLocalSession).not.toHaveBeenCalled();
    expect(await auth.retry()).toEqual({ status: "signedIn", user: USER });
  });

  it("동의 기록이 없으면 consentRequired, 조회 실패는 checkFailed → retry", async () => {
    const f = fakeClient(USER, false);
    const auth = new AuthService(f.client);
    expect(await auth.init()).toEqual({ status: "consentRequired", user: USER, checkFailed: false });
    f.client.hasConsent.mockRejectedValueOnce(new Error("offline"));
    expect(await auth.retry()).toEqual({ status: "consentRequired", user: USER, checkFailed: true });
    expect(await auth.recordConsent({ ...ALL, privacy: false })).toMatchObject({ ok: false, code: "CONSENT_REQUIRED" });
    expect(await auth.recordConsent(ALL)).toEqual({ ok: true });
    expect(auth.state()).toEqual({ status: "signedIn", user: USER });
  });

  it("로그인 성공 + 동의 없음 → consentRequired, 세션 소멸 시 signedOut", async () => {
    const f = fakeClient(null, false);
    const auth = new AuthService(f.client);
    await auth.init();
    expect(await auth.signIn("a@example.com", "abcd1234")).toEqual({ ok: true });
    expect(auth.state().status).toBe("consentRequired");
    f.emit(null);
    expect(auth.state()).toEqual({ status: "signedOut" });
  });

  it("저장된 세션이 있으면 로그인 상태, 구독자에게 알린다", async () => {
    const f = fakeClient(USER);
    const auth = new AuthService(f.client);
    const seen: string[] = [];
    auth.subscribe((s) => seen.push(s.status));
    await auth.init();
    expect(auth.state()).toEqual({ status: "signedIn", user: USER });
    f.emit(null);
    expect(seen).toEqual(["signedIn", "signedOut"]);
  });

  it("오류 문구 통일: 로그인 실패·이메일 미확인·이미 가입은 같은 문구(이메일 열거 방지)", async () => {
    const f = fakeClient();
    const auth = new AuthService(f.client);
    await auth.init();
    const messages = new Set<string>();
    for (const code of ["invalid_credentials", "email_not_confirmed", "user_already_exists", "weak_password"]) {
      f.client.signIn.mockResolvedValueOnce(failure(code));
      const out = await auth.signIn("a@example.com", "abcd1234");
      expect(out.ok).toBe(false);
      if (!out.ok) messages.add(out.message);
    }
    for (const code of ["user_already_exists", "email_exists"]) {
      f.client.signUp.mockResolvedValueOnce(failure(code, 422));
      const out = await auth.signUp("a@example.com", "abcd1234", ALL);
      if (!out.ok) messages.add(out.message);
    }
    expect([...messages]).toEqual([AUTH_MESSAGES.CREDENTIALS]);
    expect(auth.state().status).toBe("signedOut");
  });

  it("재설정 요청은 계정 유무·서버 오류와 무관하게 같은 응답, 연결 끊김만 따로", async () => {
    const f = fakeClient();
    const auth = new AuthService(f.client);
    expect(await auth.requestReset("a@example.com")).toEqual({ ok: true, message: RESET_SENT_MESSAGE });
    f.client.requestReset.mockResolvedValueOnce(failure("user_not_found", 404));
    expect(await auth.requestReset("nobody@example.com")).toEqual({ ok: true, message: RESET_SENT_MESSAGE });
    f.client.requestReset.mockResolvedValueOnce(failure("over_email_send_rate_limit", 429));
    expect(await auth.requestReset("a@example.com")).toEqual({ ok: true, message: RESET_SENT_MESSAGE });
    f.client.requestReset.mockResolvedValueOnce(failure(null, 0, true));
    expect(await auth.requestReset("a@example.com")).toMatchObject({ ok: false, code: "OFFLINE" });
    expect(await auth.requestReset("bad")).toMatchObject({ ok: false, code: "INVALID_EMAIL", field: "email" });
  });

  it("가입: 약한 비밀번호·동의 누락은 서버 호출 없이 거부, 통과하면 정규화한 이메일로 요청", async () => {
    const f = fakeClient();
    const auth = new AuthService(f.client);
    expect(await auth.signUp("a@example.com", "abcdefgh", ALL)).toMatchObject({ ok: false, code: "WEAK_PASSWORD", field: "password" });
    expect(await auth.signUp("a@example.com", "abcd1234", { ...ALL, adult: false })).toMatchObject({ ok: false, code: "CONSENT_REQUIRED" });
    expect(f.client.signUp).not.toHaveBeenCalled();
    expect((await auth.signUp(" A@Example.com ", "abcd1234", ALL)).ok).toBe(true);
    expect(f.client.signUp).toHaveBeenCalledWith("a@example.com", "abcd1234");
  });

  it("가입 코드 확인 → 로그인 상태 → 동의 기록(현재 버전·만 19세)", async () => {
    const f = fakeClient(null, false);
    const auth = new AuthService(f.client);
    await auth.init();
    expect(await auth.verifySignup("a@example.com", "12345", ALL)).toMatchObject({ ok: false, code: "INVALID_CODE" });
    expect(await auth.verifySignup("a@example.com", " 123456 ", ALL)).toEqual({ ok: true });
    expect(f.client.verifyOtp).toHaveBeenCalledWith("a@example.com", "123456", "signup");
    expect(f.client.insertConsent).toHaveBeenCalledWith(USER.id, {
      terms_version: CONSENT_VERSIONS.terms,
      privacy_version: CONSENT_VERSIONS.privacy,
      adult_confirmed: true,
    });
    expect(auth.state().status).toBe("signedIn");
  });

  it("잘못된 코드는 INVALID_CODE, 동의 기록 실패는 CONSENT_FAILED(consentRequired 유지) → recordConsent로 다시 시도", async () => {
    const f = fakeClient(null, false);
    const auth = new AuthService(f.client);
    await auth.init();
    f.client.verifyOtp.mockResolvedValueOnce(failure("otp_expired", 403));
    expect(await auth.verifySignup("a@example.com", "123456", ALL)).toMatchObject({ ok: false, code: "INVALID_CODE", field: "code" });
    f.client.insertConsent.mockResolvedValueOnce(failure("42501", 403));
    expect(await auth.verifySignup("a@example.com", "123456", ALL)).toMatchObject({ ok: false, code: "CONSENT_FAILED" });
    expect(auth.state()).toEqual({ status: "consentRequired", user: USER, checkFailed: false });
    expect(await auth.recordConsent(ALL)).toEqual({ ok: true });
    expect(auth.state().status).toBe("signedIn");
  });

  it("signOut: 로컬 저장 값을 지우지 못하면 로그인 상태 유지 + 오류(다시 시도)", async () => {
    const f = fakeClient(USER);
    const auth = new AuthService(f.client);
    await auth.init();
    f.client.clearLocalSession.mockRejectedValueOnce(new Error("keystore"));
    expect(await auth.signOut()).toMatchObject({ ok: false, code: "UNKNOWN", message: AUTH_MESSAGES.UNKNOWN });
    expect(auth.state().status).toBe("signedIn");
    expect(await auth.signOut()).toEqual({ ok: true });
    expect(auth.state()).toEqual({ status: "signedOut" });
  });

  it("가입·코드 재발송: 이미 가입·발송 제한(429)도 같은 '보냈어요' 응답(이메일 열거 방지), 연결 끊김만 따로", async () => {
    const f = fakeClient();
    const auth = new AuthService(f.client);
    const sent = await auth.signUp("a@example.com", "abcd1234", ALL);
    f.client.signUp.mockResolvedValueOnce(failure("over_email_send_rate_limit", 429));
    expect(await auth.signUp("a@example.com", "abcd1234", ALL)).toEqual(sent);
    f.client.resendSignup.mockResolvedValueOnce(failure(null, 429));
    expect(await auth.resendSignup("a@example.com")).toEqual(sent);
    f.client.resendSignup.mockResolvedValueOnce(failure("user_already_exists", 422));
    expect(await auth.resendSignup("a@example.com")).toEqual(sent);
    f.client.signUp.mockResolvedValueOnce(failure(null, 0, true));
    expect(await auth.signUp("a@example.com", "abcd1234", ALL)).toMatchObject({ ok: false, code: "OFFLINE" });
  });

  it("로그인 성공 뒤 상태를 확인하지 못하면(unavailable) 실패로 재시도 안내", async () => {
    const f = fakeClient();
    const auth = new AuthService(f.client);
    await auth.init();
    f.client.getUser.mockRejectedValueOnce(new Error("io"));
    expect(await auth.signIn("a@example.com", "abcd1234")).toMatchObject({ ok: false, code: "UNKNOWN" });
    expect(auth.state().status).toBe("unavailable");
  });

  it("동의 확인은 현재 약관·개인정보 버전으로 조회한다(개정 시 재동의)", async () => {
    const f = fakeClient(USER);
    const auth = new AuthService(f.client);
    await auth.init();
    expect(f.client.hasConsent).toHaveBeenCalledWith(USER.id, { terms_version: CONSENT_VERSIONS.terms, privacy_version: CONSENT_VERSIONS.privacy });
  });

  it("signOut: 서버 호출이 실패해도 로컬 세션을 지우고 로그아웃 상태", async () => {
    const f = fakeClient(USER);
    const auth = new AuthService(f.client);
    await auth.init();
    f.client.signOut.mockRejectedValueOnce(new Error("offline"));
    expect(await auth.signOut()).toEqual({ ok: true });
    expect(f.client.signOut).toHaveBeenCalledTimes(1);
    expect(f.client.clearLocalSession).toHaveBeenCalledTimes(1);
    expect(auth.state()).toEqual({ status: "signedOut" });
  });

  it("재설정 확인: 코드 확인 → 새 비밀번호, 저장 실패면 코드로 열린 세션을 지운다", async () => {
    const f = fakeClient();
    const auth = new AuthService(f.client);
    await auth.init();
    expect(await auth.confirmReset("a@example.com", "123456", "short")).toMatchObject({ ok: false, code: "WEAK_PASSWORD" });
    expect(f.client.verifyOtp).not.toHaveBeenCalled();
    f.client.updatePassword.mockResolvedValueOnce(failure("same_password", 422));
    expect(await auth.confirmReset("a@example.com", "123456", "abcd1234")).toMatchObject({ ok: false, code: "SAME_PASSWORD" });
    expect(f.client.clearLocalSession).toHaveBeenCalled();
    expect(auth.state().status).toBe("signedOut");
    expect(await auth.confirmReset("a@example.com", "123456", "abcd1235")).toEqual({ ok: true });
    expect(f.client.verifyOtp).toHaveBeenLastCalledWith("a@example.com", "123456", "recovery");
    expect(auth.state().status).toBe("signedIn");
  });

  it("계정 삭제: 비밀번호 재입력 → 같은 이메일로 재인증 → account-delete → 로컬 세션 삭제", async () => {
    const f = fakeClient(USER);
    const auth = new AuthService(f.client);
    await auth.init();
    expect(await auth.deleteAccount("abcd1234")).toEqual({ ok: true });
    expect(f.client.signIn).toHaveBeenCalledWith(USER.email, "abcd1234");
    expect(f.client.signIn.mock.invocationCallOrder[0]!).toBeLessThan(f.client.deleteAccount.mock.invocationCallOrder[0]!);
    expect(f.client.clearLocalSession).toHaveBeenCalled();
    expect(auth.state().status).toBe("signedOut");
  });

  it("계정 삭제: 비밀번호 오류와 서버 REAUTH_REQUIRED는 같은 문구(재입력 안내), 로그인 유지", async () => {
    const f = fakeClient(USER);
    const auth = new AuthService(f.client);
    await auth.init();
    expect(await auth.deleteAccount("")).toMatchObject({ ok: false, code: "REAUTH_REQUIRED", field: "password" });
    f.client.signIn.mockResolvedValueOnce(failure("invalid_credentials"));
    const wrong = await auth.deleteAccount("wrong1234");
    f.client.deleteAccount.mockResolvedValueOnce(failure("REAUTH_REQUIRED", 403));
    const stale = await auth.deleteAccount("abcd1234");
    expect(wrong).toEqual(stale);
    expect(wrong).toMatchObject({ ok: false, message: AUTH_MESSAGES.REAUTH_REQUIRED, field: "password" });
    expect(f.client.deleteAccount).toHaveBeenCalledTimes(1);
    expect(auth.state().status).toBe("signedIn");
  });

  it("계정 삭제: 429는 RATE_LIMITED(로그인 유지), 만료(401)는 로그아웃 + SESSION_EXPIRED, 로그아웃 상태면 호출하지 않음", async () => {
    const f = fakeClient(USER);
    const auth = new AuthService(f.client);
    await auth.init();
    f.client.deleteAccount.mockResolvedValueOnce(failure(null, 429));
    expect(await auth.deleteAccount("abcd1234")).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(auth.state().status).toBe("signedIn");
    f.client.deleteAccount.mockResolvedValueOnce(failure(null, 401));
    expect(await auth.deleteAccount("abcd1234")).toMatchObject({ ok: false, code: "SESSION_EXPIRED" });
    expect(auth.state().status).toBe("signedOut");
    expect(await auth.deleteAccount("abcd1234")).toMatchObject({ ok: false, code: "SESSION_EXPIRED" });
    expect(f.client.deleteAccount).toHaveBeenCalledTimes(2);
  });
});
