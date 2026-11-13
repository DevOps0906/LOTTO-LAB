import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Auth, type AuthCore, type AuthOutcome, type AuthViewState } from "../src";
import { renderWithNotice } from "./ticket-core";

const OK: AuthOutcome = { ok: true };
const CREDENTIALS = "이메일 또는 비밀번호를 확인해 주세요.";

const USER = { email: "a@example.com" };

function setup(initialTab?: "signin" | "signup" | "reset", initial: AuthViewState = { status: "signedOut" }) {
  let state = initial;
  const listeners = new Set<() => void>();
  const set = (next: AuthViewState) => {
    state = next;
    listeners.forEach((l) => l());
  };
  const auth = {
    state: () => state,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    retry: vi.fn<AuthCore["auth"]["retry"]>(async () => state),
    signOut: vi.fn<AuthCore["auth"]["signOut"]>(async () => {
      set({ status: "signedOut" });
      return OK;
    }),
    signIn: vi.fn<AuthCore["auth"]["signIn"]>(async () => {
      set({ status: "signedIn", user: USER });
      return OK;
    }),
    signUp: vi.fn<AuthCore["auth"]["signUp"]>(async () => ({ ok: true, message: "가입할 수 있는 이메일이면 6자리 코드를 보냈어요." })),
    resendSignup: vi.fn<AuthCore["auth"]["resendSignup"]>(async () => ({ ok: true, message: "다시 보냈어요" })),
    verifySignup: vi.fn<AuthCore["auth"]["verifySignup"]>(async () => {
      set({ status: "signedIn", user: USER });
      return OK;
    }),
    recordConsent: vi.fn<AuthCore["auth"]["recordConsent"]>(async () => OK),
    requestReset: vi.fn<AuthCore["auth"]["requestReset"]>(async () => ({ ok: true, message: "가입된 이메일이면 6자리 코드를 보냈어요." })),
    confirmReset: vi.fn<AuthCore["auth"]["confirmReset"]>(async () => {
      set({ status: "signedIn", user: USER });
      return OK;
    }),
  };
  const onDone = vi.fn();
  const user = userEvent.setup();
  renderWithNotice(<Auth core={{ auth }} links={{ guest: "#/" }} initialTab={initialTab} onDone={onDone} />);
  return { auth, onDone, user, set };
}

describe("M-06 로그인·가입·재설정", () => {
  it("탭 3개·게스트로 계속·로컬 번호 미전송 안내, 키보드로 탭 이동", async () => {
    const { user } = setup();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["로그인", "가입", "비밀번호 재설정"]);
    expect(screen.getByRole("tab", { name: "로그인" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: "게스트로 계속" })).toHaveAttribute("href", "#/");
    expect(screen.getByText(/로그인 전에 서버로 보내지 않습니다/)).toBeInTheDocument();
    screen.getByRole("tab", { name: "로그인" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "가입" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "가입" })).toHaveFocus();
  });

  it("로그인 성공 → onDone(원래 화면 복귀)", async () => {
    const { auth, onDone, user } = setup();
    await user.type(screen.getByLabelText("이메일"), "a@example.com");
    await user.type(screen.getByLabelText("비밀번호"), "abcd1234");
    await user.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(auth.signIn).toHaveBeenCalledWith("a@example.com", "abcd1234");
  });

  it("로그인 실패: 서비스 문구를 그대로 보이고 제출 중에는 잠근다", async () => {
    const { auth, onDone, user } = setup();
    let resolve: (out: AuthOutcome) => void = () => {};
    auth.signIn.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    await user.type(screen.getByLabelText("이메일"), "a@example.com");
    await user.type(screen.getByLabelText("비밀번호"), "wrong1234");
    await user.click(screen.getByRole("button", { name: "로그인" }));
    expect(screen.getByRole("button", { name: "로그인하는 중" })).toBeDisabled();
    resolve({ ok: false, code: "CREDENTIALS", message: CREDENTIALS });
    expect(await screen.findByText(CREDENTIALS)).toHaveAttribute("role", "alert");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("가입: 동의 3개 → 코드 받기 → 6자리 코드(숫자만) → 가입 완료", async () => {
    const { auth, onDone, user } = setup("signup");
    await user.type(screen.getByLabelText("이메일"), "a@example.com");
    await user.type(screen.getByLabelText("비밀번호"), "abcd1234");
    expect(screen.getByText("8자 이상, 영문과 숫자를 함께 써 주세요.")).toBeInTheDocument();
    await user.click(screen.getByLabelText("이용약관에 동의합니다 (필수)"));
    await user.click(screen.getByLabelText(/개인정보 수집·이용/));
    await user.click(screen.getByLabelText("만 19세 이상입니다 (필수)"));
    await user.click(screen.getByRole("button", { name: "코드 받기" }));
    expect(auth.signUp).toHaveBeenCalledWith("a@example.com", "abcd1234", { terms: true, privacy: true, adult: true });
    expect(await screen.findByText(/6자리 코드를 보냈어요/)).toHaveAttribute("role", "status");
    const code = screen.getByLabelText("6자리 코드");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    await user.type(code, "12a3456");
    expect(code).toHaveValue("123456");
    await user.click(screen.getByRole("button", { name: "가입 완료" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(auth.verifySignup).toHaveBeenCalledWith("a@example.com", "123456", { terms: true, privacy: true, adult: true });
  });

  it("가입: 동의 누락 오류 표시, 동의 기록 실패 → 동의 단계(체크 유지·실패 문구)에서 recordConsent", async () => {
    const { auth, onDone, user, set } = setup("signup");
    auth.signUp.mockResolvedValueOnce({ ok: false, code: "CONSENT_REQUIRED", message: "필수 동의 항목을 모두 확인해 주세요.", field: "consent" });
    await user.click(screen.getByRole("button", { name: "코드 받기" }));
    expect(await screen.findByText(/필수 동의 항목/)).toHaveAttribute("role", "alert");
    await user.click(screen.getByLabelText("이용약관에 동의합니다 (필수)"));
    await user.click(screen.getByLabelText(/개인정보 수집·이용/));
    await user.click(screen.getByLabelText("만 19세 이상입니다 (필수)"));
    await user.click(screen.getByRole("button", { name: "코드 받기" }));
    await user.type(await screen.findByLabelText("6자리 코드"), "123456");
    const failed = "동의 기록을 저장하지 못했어요. 다시 시도해 주세요.";
    auth.verifySignup.mockImplementationOnce(async () => {
      set({ status: "consentRequired", user: USER, checkFailed: false });
      return { ok: false, code: "CONSENT_FAILED", message: failed };
    });
    await user.click(screen.getByRole("button", { name: "가입 완료" }));
    expect(await screen.findByText(failed)).toHaveAttribute("role", "alert");
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByLabelText("만 19세 이상입니다 (필수)")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "동의하고 계속" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(auth.recordConsent).toHaveBeenCalledWith({ terms: true, privacy: true, adult: true });
  });

  it("로그인 성공 + 동의 기록 없음 → 복귀하지 않고 동의 단계, 로그아웃하면 탭으로", async () => {
    const { auth, onDone, user, set } = setup();
    auth.signIn.mockImplementationOnce(async () => {
      set({ status: "consentRequired", user: USER, checkFailed: false });
      return OK;
    });
    await user.type(screen.getByLabelText("이메일"), "a@example.com");
    await user.type(screen.getByLabelText("비밀번호"), "abcd1234");
    await user.click(screen.getByRole("button", { name: "로그인" }));
    expect(await screen.findByRole("button", { name: "동의하고 계속" })).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("tab", { name: "로그인" })).toBeInTheDocument();
  });

  it("코드 확인 뒤 동의 기록이 오프라인으로 실패해도 동의 단계(코드 재입력 없음)", async () => {
    const { auth, user, set } = setup("signup");
    await user.click(screen.getByLabelText("이용약관에 동의합니다 (필수)"));
    await user.click(screen.getByLabelText(/개인정보 수집·이용/));
    await user.click(screen.getByLabelText("만 19세 이상입니다 (필수)"));
    await user.click(screen.getByRole("button", { name: "코드 받기" }));
    await user.type(await screen.findByLabelText("6자리 코드"), "123456");
    const offline = "인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
    auth.verifySignup.mockImplementationOnce(async () => {
      set({ status: "consentRequired", user: USER, checkFailed: false });
      return { ok: false, code: "OFFLINE", message: offline };
    });
    await user.click(screen.getByRole("button", { name: "가입 완료" }));
    expect(await screen.findByText(offline)).toHaveAttribute("role", "alert");
    expect(screen.getByRole("button", { name: "동의하고 계속" })).toBeInTheDocument();
    expect(screen.queryByLabelText("6자리 코드")).toBeNull();
  });

  it("로그인 응답이 성공이어도 최종 상태가 signedIn이 아니면 복귀하지 않는다", async () => {
    const { auth, onDone, user, set } = setup();
    auth.signIn.mockImplementationOnce(async () => {
      set({ status: "unavailable" });
      return OK;
    });
    await user.type(screen.getByLabelText("이메일"), "a@example.com");
    await user.type(screen.getByLabelText("비밀번호"), "abcd1234");
    await user.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(auth.signIn).toHaveBeenCalledTimes(1));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "로그인" })).toBeInTheDocument();
  });

  it("진입 시 동의 조회 실패(checkFailed) → 재시도 안내 → 다시 확인으로 signedIn이면 복귀", async () => {
    const { auth, onDone, user, set } = setup(undefined, { status: "consentRequired", user: USER, checkFailed: true });
    expect(screen.getByText(/가입 동의 기록을 확인하지 못했어요/)).toHaveAttribute("role", "alert");
    auth.retry.mockImplementationOnce(async () => {
      set({ status: "signedIn", user: USER });
      return { status: "signedIn", user: USER };
    });
    await user.click(screen.getByRole("button", { name: "다시 확인" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("재설정: 이메일 → 항상 같은 안내 → 코드·새 비밀번호 → 완료", async () => {
    const { auth, onDone, user } = setup();
    await user.click(screen.getByRole("button", { name: "비밀번호를 잊었어요" }));
    expect(screen.getByRole("tab", { name: "비밀번호 재설정" })).toHaveAttribute("aria-selected", "true");
    await user.type(screen.getByLabelText("가입한 이메일"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "코드 받기" }));
    expect(await screen.findByText("가입된 이메일이면 6자리 코드를 보냈어요.")).toHaveAttribute("role", "status");
    await user.type(screen.getByLabelText("6자리 코드"), "654321");
    await user.type(screen.getByLabelText("새 비밀번호"), "newpass99");
    await user.click(screen.getByRole("button", { name: "비밀번호 바꾸기" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(auth.confirmReset).toHaveBeenCalledWith("a@example.com", "654321", "newpass99");
  });
});
