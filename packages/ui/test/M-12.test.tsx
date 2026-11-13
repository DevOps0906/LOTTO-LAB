import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CLEAR_PHRASE, Settings, type SettingsAuth } from "../src";
import { fakeSettingsCore, renderWithNotice } from "./ticket-core";

function setup(summary?: Parameters<typeof fakeSettingsCore>[0]) {
  const f = fakeSettingsCore(summary);
  const onThemeChange = vi.fn();
  const onCleared = vi.fn();
  renderWithNotice(<Settings core={f.core} appVersion="0.1.0" onThemeChange={onThemeChange} onCleared={onCleared} />);
  return { ...f, onThemeChange, onCleared };
}

describe("M-12 설정", () => {
  it("로딩 → 성공: 테마·19세 확인 시각·권한·데이터 개수·앱 버전·준비 중 항목, 광고 동의는 보이지 않는다", async () => {
    const f = setup();
    expect(screen.getByText("설정을 불러오는 중입니다")).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: "시스템 설정" })).toBeChecked();
    expect(screen.getByText(/확인함/)).toBeInTheDocument();
    expect(screen.getByText(/즐겨찾기 1개 · 구매 기록 1개 · 생성 이력 3개/)).toBeInTheDocument();
    expect(screen.getByText("0.1.0")).toBeInTheDocument();
    expect(screen.getByText("이용약관").nextSibling).toHaveTextContent("준비 중");
    expect(screen.getByText("개인정보 처리방침").nextSibling).toHaveTextContent("준비 중");
    expect(screen.getByText("오픈소스 라이선스").nextSibling).toHaveTextContent("준비 중");
    expect(screen.queryByText(/광고/)).toBeNull();
    expect(f.core.ageGate.confirmedAt).toHaveBeenCalled();
  });

  it("오류 상태 + 다시 시도", async () => {
    const f = fakeSettingsCore();
    vi.mocked(f.core.data.summary).mockRejectedValueOnce(new Error("io"));
    renderWithNotice(<Settings core={f.core} appVersion="0.1.0" onThemeChange={vi.fn()} onCleared={vi.fn()} />);
    expect(await screen.findByText("설정을 불러오지 못했습니다")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("radio", { name: "다크" })).toBeInTheDocument();
  });

  it("테마 다크 선택 → 셸에 즉시 적용 + 저장", async () => {
    const f = setup();
    expect(await screen.findByRole("radiogroup", { name: "테마" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "다크" }));
    expect(screen.getByRole("radio", { name: "다크" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "시스템 설정" })).not.toBeChecked();
    expect(f.onThemeChange).toHaveBeenCalledWith("dark");
    expect(f.setTheme).toHaveBeenCalledWith("dark");
  });

  it("내보내기: JSON 복사(000719 문자열 보존)·공유, 기록이 없으면 비활성(빈 상태)", async () => {
    const f = setup();
    await userEvent.click(await screen.findByRole("button", { name: "내보내기(JSON 복사)" }));
    await waitFor(() => expect(f.writeText).toHaveBeenCalled());
    expect(f.writeText.mock.calls[0]![0]).toContain('"digits": "000719"');
    expect(await screen.findByText("복사했어요")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "내보내기(공유)" }));
    await waitFor(() => expect(f.share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("000719") })));
  });

  it("빈 데이터: 내보내기 비활성 + 안내", async () => {
    setup({ tickets: 0, favorites: 0, purchased: 0, generated: 0 });
    expect(await screen.findByText("내보낼 기록이 아직 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "내보내기(JSON 복사)" })).toBeDisabled();
  });

  it("모두 삭제: 문구 재입력 전 비활성 → AlertDialog 취소는 아무것도 안 함 → 삭제 확인 시 clearAll + onCleared", async () => {
    const f = setup();
    const button = await screen.findByRole("button", { name: "모든 데이터 삭제" });
    expect(button).toBeDisabled();
    const input = screen.getByRole("textbox", { name: `확인을 위해 ‘${CLEAR_PHRASE}’를 입력하세요` });
    await userEvent.type(input, "모두");
    expect(button).toBeDisabled();
    await userEvent.type(input, " 삭제");
    expect(button).toBeEnabled();
    await userEvent.click(button);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("되돌릴 수 없습니다");
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(f.clearAll).not.toHaveBeenCalled();
    await userEvent.click(button);
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(f.onCleared).toHaveBeenCalledTimes(1));
    expect(f.clearAll).toHaveBeenCalledTimes(1);
  });

  it("모두 삭제 실패는 화면에 남기고 onCleared를 부르지 않는다", async () => {
    const f = setup();
    f.clearAll.mockRejectedValueOnce(new Error("io"));
    await userEvent.type(await screen.findByRole("textbox", { name: /확인을 위해/ }), CLEAR_PHRASE);
    await userEvent.click(screen.getByRole("button", { name: "모든 데이터 삭제" }));
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(await screen.findByText("일부 데이터를 지우지 못했어요. 다시 시도하세요.")).toBeInTheDocument();
    expect(f.onCleared).not.toHaveBeenCalled();
  });

  it("auth가 없으면(Windows) 계정 항목은 준비 중 안내만", async () => {
    setup();
    expect(await screen.findByText("계정 삭제 — 로그인 기능과 함께 제공 예정")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "로그인·가입" })).toBeNull();
  });
});

type AuthStateOf = ReturnType<SettingsAuth["state"]>;

function fakeAuth(signedIn: boolean | AuthStateOf) {
  type State = AuthStateOf;
  let state: State =
    typeof signedIn === "object" ? signedIn : signedIn ? { status: "signedIn", user: { email: "a@example.com" } } : { status: "signedOut" };
  const listeners = new Set<(s: unknown) => void>();
  const set = (next: State) => {
    state = next;
    listeners.forEach((l) => l(next));
  };
  const auth = {
    state: () => state,
    subscribe: (l: (s: unknown) => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    signOut: vi.fn<SettingsAuth["signOut"]>(async () => {
      set({ status: "signedOut" });
      return { ok: true };
    }),
    retry: vi.fn(async () => state),
    deleteAccount: vi.fn<SettingsAuth["deleteAccount"]>(async () => {
      set({ status: "signedOut" });
      return { ok: true };
    }),
  } satisfies SettingsAuth;
  return auth;
}

describe("M-12 계정(task-043)", () => {
  function setupAuth(signedIn: boolean | AuthStateOf) {
    const f = fakeSettingsCore();
    const auth = fakeAuth(signedIn);
    const onLogin = vi.fn();
    renderWithNotice(<Settings core={{ ...f.core, auth }} appVersion="0.1.0" onThemeChange={vi.fn()} onCleared={vi.fn()} onLogin={onLogin} />);
    return { auth, onLogin };
  }

  it("로그아웃 상태: 로그인·가입 버튼 → onLogin, 로컬 번호 미전송 안내", async () => {
    const { onLogin } = setupAuth(false);
    await userEvent.click(await screen.findByRole("button", { name: "로그인·가입" }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/로그인 전에는 이 기기의 번호를 서버로 보내지 않습니다/)).toBeInTheDocument();
  });

  it("로그인 상태: 이메일 표시·로그아웃", async () => {
    const { auth } = setupAuth(true);
    expect(await screen.findByText("a@example.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "로그인·가입" })).toBeInTheDocument();
  });

  it("계정 삭제: 확인 모달 취소는 아무것도 안 함 → 확인 → 비밀번호 재입력 → deleteAccount(비밀번호) → 로그아웃 상태", async () => {
    const { auth } = setupAuth(true);
    await userEvent.click(await screen.findByRole("button", { name: "계정 삭제" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("되돌릴 수 없습니다");
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByLabelText(/비밀번호를 다시 입력하세요/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "계정 삭제" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "계정 삭제" }));
    const submit = screen.getByRole("button", { name: "비밀번호 확인 후 삭제" });
    expect(submit).toBeDisabled();
    expect(auth.deleteAccount).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/비밀번호를 다시 입력하세요/), "abcd1234");
    await userEvent.click(submit);
    await waitFor(() => expect(auth.deleteAccount).toHaveBeenCalledWith("abcd1234"));
    expect(await screen.findByText("계정을 삭제했어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그인·가입" })).toBeInTheDocument();
  });

  it("재인증 실패(비밀번호 오류·REAUTH_REQUIRED)는 문구를 남기고 비밀번호를 비워 재입력 안내, 로그인 유지", async () => {
    const { auth } = setupAuth(true);
    const message = "비밀번호를 확인해 주세요. 계정을 삭제하려면 지금 비밀번호를 다시 입력해야 합니다.";
    auth.deleteAccount.mockResolvedValueOnce({ ok: false, message });
    await userEvent.click(await screen.findByRole("button", { name: "계정 삭제" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "계정 삭제" }));
    const input = screen.getByLabelText(/비밀번호를 다시 입력하세요/);
    await userEvent.type(input, "wrong1234");
    await userEvent.click(screen.getByRole("button", { name: "비밀번호 확인 후 삭제" }));
    expect(await screen.findByText(message)).toHaveAttribute("role", "alert");
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("a@example.com")).toBeInTheDocument();
  });

  it("로그아웃: 저장 값을 지우지 못하면 오류 문구, 로그인 상태 유지", async () => {
    const { auth } = setupAuth(true);
    auth.signOut.mockResolvedValueOnce({ ok: false, message: "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." });
    await userEvent.click(await screen.findByRole("button", { name: "로그아웃" }));
    expect(await screen.findByText("요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.")).toHaveAttribute("role", "alert");
    expect(screen.getByText("a@example.com")).toBeInTheDocument();
  });

  it("동의 전(consentRequired): 가입 동의하기 → onLogin, 로그아웃·계정 삭제 가능 / 조회 실패는 다시 확인", async () => {
    const { onLogin } = setupAuth({ status: "consentRequired", user: { email: "a@example.com" }, checkFailed: false });
    expect(await screen.findByText(/가입 동의가 끝나지 않아/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "가입 동의하기" }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "계정 삭제" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });

  it("동의 조회 실패·기기 저장소 읽기 실패 → 다시 확인(retry)", async () => {
    const { auth } = setupAuth({ status: "consentRequired", user: { email: "a@example.com" }, checkFailed: true });
    await userEvent.click(await screen.findByRole("button", { name: "다시 확인" }));
    expect(auth.retry).toHaveBeenCalledTimes(1);
  });

  it("기기 저장소 읽기 실패(unavailable) → 오류 안내와 다시 확인", async () => {
    const { auth } = setupAuth({ status: "unavailable" });
    expect(await screen.findByText(/로그인 정보를 읽지 못했어요/)).toHaveAttribute("role", "alert");
    await userEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(auth.retry).toHaveBeenCalledTimes(1);
  });
});
