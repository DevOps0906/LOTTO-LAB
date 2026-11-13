import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FortuneProfile, type FortuneProfileCore, type SajuAuthState, type SajuProfile } from "../src";
import { renderWithNotice } from "./generator-core";

const LINKS = { home: "#/", generate: "#/generate", saju: "#/fortune/saju" };
const HOURS = [
  { id: "ja", label: "자시(23~01시)" },
  { id: "myo", label: "묘시(05~07시)" },
];
const PROFILE: SajuProfile = { birth_date: "1990-03-15", calendar: "solar", is_leap_month: false, birth_hour: null };

type Save = FortuneProfileCore["fortuneProfile"]["save"];

function makeAuth(initial: SajuAuthState) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    auth: {
      state: () => state,
      subscribe: (l: () => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      retry: vi.fn(async () => state),
    },
    set(next: SajuAuthState) {
      state = next;
      act(() => listeners.forEach((l) => l()));
    },
  };
}

const SIGNED_IN: SajuAuthState = { status: "signedIn", user: { id: "u1" } };

function setup(options: { initial?: SajuAuthState; profile?: SajuProfile | null; save?: Save } = {}) {
  const a = makeAuth(options.initial ?? SIGNED_IN);
  const fortuneProfile = {
    load: vi.fn<FortuneProfileCore["fortuneProfile"]["load"]>(async () => ({ ok: true, value: options.profile ?? null })),
    save: vi.fn<Save>(options.save ?? (async (input) => ({ ok: true, value: input as SajuProfile }))),
    remove: vi.fn<FortuneProfileCore["fortuneProfile"]["remove"]>(async () => ({ ok: true, value: null })),
  };
  const onLogin = vi.fn();
  const navigate = vi.fn();
  const user = userEvent.setup();
  renderWithNotice(<FortuneProfile core={{ auth: a.auth, fortuneProfile }} links={LINKS} hours={HOURS} onLogin={onLogin} navigate={navigate} />);
  return { ...a, fortuneProfile, onLogin, navigate, user };
}

const saveButton = () => screen.getByRole("button", { name: "저장" });

describe("M-18 사주 프로필 — 인증 게이트", () => {
  it.each<[SajuAuthState, RegExp]>([
    [{ status: "signedOut" }, /로그인이 필요해요/],
    [{ status: "consentRequired" }, /가입 동의를 마치면/],
  ])("%j: 진입 차단·프로필 읽기 없음·M-06 유도", async (initial) => {
    const { fortuneProfile, onLogin, user } = setup({ initial });
    expect(screen.getByText("로그인이 필요해요")).toBeInTheDocument();
    expect(screen.queryByLabelText("생년월일(필수)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "로그인·가입" }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(fortuneProfile.load).not.toHaveBeenCalled();
  });

  it("loading은 대기, unavailable은 다시 확인", async () => {
    const loading = setup({ initial: { status: "loading" } });
    expect(screen.getByText("로그인 상태를 확인하는 중입니다")).toBeInTheDocument();
    loading.set({ status: "unavailable" });
    await userEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(loading.auth.retry).toHaveBeenCalled();
    expect(loading.fortuneProfile.load).not.toHaveBeenCalled();
  });

  it("로그아웃하면 입력한 폼이 즉시 사라진다", async () => {
    const { set, user } = setup();
    await user.type(await screen.findByLabelText("생년월일(필수)"), "1990-03-15");
    set({ status: "signedOut" });
    expect(screen.queryByLabelText("생년월일(필수)")).not.toBeInTheDocument();
    expect(screen.getByText("로그인이 필요해요")).toBeInTheDocument();
    set(SIGNED_IN);
    expect(await screen.findByLabelText("생년월일(필수)")).toHaveValue("");
  });

  it("계정이 바뀌면 이전 계정의 늦은 프로필 응답을 버린다", async () => {
    const a = makeAuth(SIGNED_IN);
    let resolveFirst: (v: { ok: true; value: SajuProfile | null }) => void = () => {};
    const load = vi
      .fn<FortuneProfileCore["fortuneProfile"]["load"]>()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValue({ ok: true, value: null });
    const fortuneProfile = { load, save: vi.fn<Save>(), remove: vi.fn() };
    renderWithNotice(<FortuneProfile core={{ auth: a.auth, fortuneProfile }} links={LINKS} hours={HOURS} onLogin={() => {}} navigate={() => {}} />);
    a.set({ status: "signedIn", user: { id: "u2" } });
    expect(await screen.findByLabelText("생년월일(필수)")).toHaveValue("");
    await act(async () => resolveFirst({ ok: true, value: PROFILE }));
    expect(screen.getByLabelText("생년월일(필수)")).toHaveValue("");
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("M-18 사주 프로필 — 폼", () => {
  it("프로필 없음: 입력 안내·동의 전 저장 비활성·고지·수집 항목·성별 미수집", async () => {
    const { user } = setup();
    expect(await screen.findByText(/저장된 프로필이 없어요/)).toBeInTheDocument();
    expect(screen.getByText("재미·참고용 · 전통 상징 해석이며 당첨 확률과 무관")).toBeInTheDocument();
    expect(screen.getByText(/성별 등 다른 정보는 수집하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByText(/계정을 삭제하면/)).toBeInTheDocument();
    expect(screen.getByText("개인정보 처리방침(준비 중)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "프로필 삭제" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("생년월일(필수)"), "1990-03-15");
    expect(saveButton()).toBeDisabled(); // 동의 전
    await user.click(screen.getByRole("checkbox", { name: /개인정보 수집·이용에 동의/ }));
    expect(saveButton()).toBeEnabled();
  });

  it("동의 없이 저장 불가, 형식 오류는 필드 옆 안내(서버 호출 없음)", async () => {
    const { fortuneProfile, user } = setup();
    await user.type(await screen.findByLabelText("생년월일(필수)"), "1990-3-5");
    await user.click(screen.getByRole("checkbox", { name: /개인정보 수집·이용에 동의/ }));
    await user.click(saveButton());
    expect(await screen.findByText(/YYYY-MM-DD 형식으로 입력하세요/)).toBeInTheDocument();
    expect(fortuneProfile.save).not.toHaveBeenCalled();
  });

  it("저장: 양력·시각 모름 → null로 전송 후 M-19로 이동, 음력일 때만 윤달 선택", async () => {
    const { fortuneProfile, navigate, user } = setup();
    await user.type(await screen.findByLabelText("생년월일(필수)"), "1990-03-15");
    expect(screen.queryByRole("checkbox", { name: "윤달" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /개인정보 수집·이용에 동의/ }));
    await user.click(saveButton());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("#/fortune/saju"));
    expect(fortuneProfile.save).toHaveBeenCalledWith({ birth_date: "1990-03-15", calendar: "solar", is_leap_month: false, birth_hour: null }, true);
  });

  it("음력 윤달·시각 선택을 그대로 보내고, 양력으로 바꾸면 윤달이 꺼진다", async () => {
    const { fortuneProfile, user } = setup();
    await user.type(await screen.findByLabelText("생년월일(필수)"), "1989-05-30");
    await user.click(screen.getByRole("radio", { name: "음력" }));
    await user.click(screen.getByRole("checkbox", { name: "윤달" }));
    await user.click(screen.getByRole("radio", { name: "양력" }));
    await user.click(screen.getByRole("radio", { name: "음력" }));
    expect(screen.getByRole("checkbox", { name: "윤달" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "윤달" }));
    await user.selectOptions(screen.getByLabelText("태어난 시각(모르면 비움)"), "myo");
    await user.click(screen.getByRole("checkbox", { name: /개인정보 수집·이용에 동의/ }));
    await user.click(saveButton());
    await waitFor(() => expect(fortuneProfile.save).toHaveBeenCalled());
    expect(fortuneProfile.save).toHaveBeenCalledWith({ birth_date: "1989-05-30", calendar: "lunar", is_leap_month: true, birth_hour: "myo" }, true);
  });

  it("저장 실패: 입력 보존·이동 없음·잠금 해제, 서버 입력 오류는 날짜 옆 안내(입력값 미노출)", async () => {
    const save = vi
      .fn<Save>()
      .mockResolvedValueOnce({ ok: false, code: "OFFLINE" })
      .mockResolvedValueOnce({ ok: false, code: "INVALID_INPUT", field: "birth_date" });
    const { navigate, user } = setup({ save });
    await user.type(await screen.findByLabelText("생년월일(필수)"), "2999-01-01");
    await user.click(screen.getByRole("checkbox", { name: /개인정보 수집·이용에 동의/ }));
    await user.click(saveButton());
    expect(await screen.findByText(/인터넷에 연결되어 있지 않아요/)).toBeInTheDocument();
    expect(screen.getByLabelText("생년월일(필수)")).toHaveValue("2999-01-01");
    await user.click(saveButton());
    expect(await screen.findByText(/생년월일을 확인해 주세요/)).toBeInTheDocument();
    expect(screen.getByLabelText("생년월일(필수)")).toHaveAttribute("aria-invalid", "true");
    expect(navigate).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/Failing row/);
  });

  it("저장 중에는 입력·버튼이 잠기고 중복 제출되지 않는다", async () => {
    let finish: (v: { ok: true; value: SajuProfile }) => void = () => {};
    const save = vi.fn<Save>(() => new Promise((resolve) => (finish = resolve)));
    const { user } = setup({ save });
    await user.type(await screen.findByLabelText("생년월일(필수)"), "1990-03-15");
    await user.click(screen.getByRole("checkbox", { name: /개인정보 수집·이용에 동의/ }));
    await user.click(saveButton());
    expect(screen.getByRole("button", { name: "저장하는 중" })).toBeDisabled();
    expect(screen.getByLabelText("생년월일(필수)")).toBeDisabled();
    await act(async () => finish({ ok: true, value: PROFILE }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("저장된 프로필은 채워지고(동의 표시), 삭제는 확인 대화상자 뒤 파기 안내와 함께 폼을 비운다", async () => {
    const { fortuneProfile, user } = setup({ profile: { birth_date: "1989-05-02", calendar: "lunar", is_leap_month: true, birth_hour: "ja" } });
    expect(await screen.findByLabelText("생년월일(필수)")).toHaveValue("1989-05-02");
    expect(screen.getByRole("radio", { name: "음력" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "윤달" })).toBeChecked();
    expect(screen.getByLabelText("태어난 시각(모르면 비움)")).toHaveValue("ja");
    await user.click(screen.getByRole("button", { name: "프로필 삭제" }));
    expect(fortuneProfile.remove).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("서버에 저장된 생년월일·태어난 시각이 삭제되며 되돌릴 수 없습니다");
    await user.click(screen.getByRole("button", { name: "삭제" }));
    expect(await screen.findByText(/프로필을 삭제했어요/)).toBeInTheDocument();
    expect(fortuneProfile.remove).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("생년월일(필수)")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "프로필 삭제" })).not.toBeInTheDocument();
  });

  it.each<["SESSION_EXPIRED" | "FORBIDDEN" | "OFFLINE", RegExp, string]>([
    ["SESSION_EXPIRED", /로그인이 만료됐어요/, "다시 로그인"],
    ["FORBIDDEN", /권한이 없어요/, "다시 로그인"],
    ["OFFLINE", /인터넷에 연결되어 있지 않아요/, "다시 시도"],
  ])("조회 실패 %s: 코드별 안내와 행동", async (code, text, action) => {
    const a = makeAuth(SIGNED_IN);
    const onLogin = vi.fn();
    const load = vi.fn<FortuneProfileCore["fortuneProfile"]["load"]>(async () => ({ ok: false, code }));
    const user = userEvent.setup();
    renderWithNotice(
      <FortuneProfile core={{ auth: a.auth, fortuneProfile: { load, save: vi.fn<Save>(), remove: vi.fn() } }} links={LINKS} hours={HOURS} onLogin={onLogin} navigate={() => {}} />,
    );
    expect(await screen.findByText(text)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: action }));
    if (action === "다시 로그인") expect(onLogin).toHaveBeenCalledTimes(1);
    else expect(load).toHaveBeenCalledTimes(2);
  });

  it("동의 고지에 보유 기간과 미동의 시 이용 범위가 있다", async () => {
    setup();
    expect(await screen.findByText(/프로필 삭제 또는 계정 삭제 시까지/)).toBeInTheDocument();
    expect(screen.getByText(/동의하지 않아도 다른 번호 생성은 이용할 수 있고, 사주 번호만 쓸 수 없습니다/)).toBeInTheDocument();
  });

  it("저장 중 로그아웃·계정 전환 뒤 이전 응답이 끝나도 이동·초기화가 없다", async () => {
    let finish: (v: { ok: true; value: SajuProfile }) => void = () => {};
    const save = vi.fn<Save>(() => new Promise((resolve) => (finish = resolve)));
    const { set, navigate, user } = setup({ save });
    await user.type(await screen.findByLabelText("생년월일(필수)"), "1990-03-15");
    await user.click(screen.getByRole("checkbox", { name: /개인정보 수집·이용에 동의/ }));
    await user.click(saveButton());
    set({ status: "signedOut" });
    set({ status: "signedIn", user: { id: "u2" } });
    expect(await screen.findByLabelText("생년월일(필수)")).toHaveValue("");
    await act(async () => finish({ ok: true, value: PROFILE }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("생년월일(필수)")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "프로필 삭제" })).not.toBeInTheDocument();
  });

  it("삭제 중 계정 전환 뒤 이전 삭제 응답이 끝나도 삭제 알림·폼 초기화가 새 계정에 나타나지 않는다", async () => {
    let finish: (v: { ok: true; value: null }) => void = () => {};
    const a = makeAuth(SIGNED_IN);
    const load = vi
      .fn<FortuneProfileCore["fortuneProfile"]["load"]>()
      .mockResolvedValueOnce({ ok: true, value: PROFILE })
      .mockResolvedValue({ ok: true, value: { ...PROFILE, birth_date: "1985-01-01" } });
    const remove = vi.fn<FortuneProfileCore["fortuneProfile"]["remove"]>(() => new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    renderWithNotice(
      <FortuneProfile core={{ auth: a.auth, fortuneProfile: { load, save: vi.fn<Save>(), remove } }} links={LINKS} hours={HOURS} onLogin={() => {}} navigate={() => {}} />,
    );
    await screen.findByDisplayValue("1990-03-15");
    await user.click(screen.getByRole("button", { name: "프로필 삭제" }));
    await user.click(screen.getByRole("button", { name: "삭제" }));
    a.set({ status: "signedIn", user: { id: "u2" } });
    expect(await screen.findByDisplayValue("1985-01-01")).toBeInTheDocument();
    await act(async () => finish({ ok: true, value: null }));
    expect(screen.queryByText(/프로필을 삭제했어요/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("생년월일(필수)")).toHaveValue("1985-01-01");
  });

  it("삭제 실패는 입력을 유지하고 안내한다. 프로필 읽기 실패는 다시 시도", async () => {
    const a = makeAuth(SIGNED_IN);
    const load = vi
      .fn<FortuneProfileCore["fortuneProfile"]["load"]>()
      .mockResolvedValueOnce({ ok: false, code: "OFFLINE" })
      .mockResolvedValue({ ok: true, value: PROFILE });
    const remove = vi.fn<FortuneProfileCore["fortuneProfile"]["remove"]>(async () => ({ ok: false, code: "OFFLINE" }));
    const user = userEvent.setup();
    renderWithNotice(<FortuneProfile core={{ auth: a.auth, fortuneProfile: { load, save: vi.fn<Save>(), remove } }} links={LINKS} hours={HOURS} onLogin={() => {}} navigate={() => {}} />);
    expect(await screen.findByText("프로필을 불러오지 못했어요")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByLabelText("생년월일(필수)")).toHaveValue("1990-03-15");
    await user.click(screen.getByRole("button", { name: "프로필 삭제" }));
    await user.click(screen.getByRole("button", { name: "삭제" }));
    expect(await screen.findByText(/인터넷에 연결되어 있지 않아요/)).toBeInTheDocument();
    expect(screen.getByLabelText("생년월일(필수)")).toHaveValue("1990-03-15");
  });
});
