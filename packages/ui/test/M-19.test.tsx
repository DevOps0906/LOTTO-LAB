import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SajuNumbers, type FortuneRequestInput, type SajuAuthState, type SajuNumbersCore, type SajuProfile } from "../src";
import { mockGeneratorCore, renderWithNotice } from "./generator-core";

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

const LINKS = { home: "#/", generate: "#/generate", profile: "#/fortune/profile", theme: "#/generate/theme" };
const HOURS = [{ id: "myo", label: "묘시(05~07시)" }];
const PROFILE: SajuProfile = { birth_date: "1990-03-15", calendar: "solar", is_leap_month: false, birth_hour: "myo" };
const NUMS = [[3, 9, 14, 25, 33, 42], [1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18], [19, 20, 21, 22, 23, 24]];
const SIGNED_IN: SajuAuthState = { status: "signedIn", user: { id: "u1" } };

type Result = Awaited<ReturnType<SajuNumbersCore["fortune"]["generate"]>>;

function setup(options: { initial?: SajuAuthState; profile?: SajuProfile | null; generate?: (r: FortuneRequestInput) => Promise<Result> } = {}) {
  const a = makeAuth(options.initial ?? SIGNED_IN);
  const m = mockGeneratorCore();
  let batchNo = 0;
  const generate = vi.fn(
    options.generate ??
      (async (request: FortuneRequestInput): Promise<Result> => {
        const batch_id = `saju-${++batchNo}`;
        if (request.game === "pension") {
          return { batch_id, method: "saju", saved: true, records: request.groups.map((g) => ({ id: `${batch_id}-${g}`, game: "pension" as const, numbers: { digits: "000719" }, group_no: g })) };
        }
        return { batch_id, method: "saju", saved: true, records: NUMS.map((nums, i) => ({ id: `${batch_id}-${i + 1}`, game: "lotto" as const, numbers: { nums }, group_no: null })) };
      }),
  );
  const load = vi.fn<SajuNumbersCore["fortuneProfile"]["load"]>(async () => ({ ok: true, value: options.profile === undefined ? PROFILE : options.profile }));
  const core = { ...(m.core as object), auth: a.auth, fortuneProfile: { load }, fortune: { generate } } as unknown as SajuNumbersCore;
  const navigate = vi.fn();
  const onLogin = vi.fn();
  const user = userEvent.setup();
  renderWithNotice(<SajuNumbers core={core} links={LINKS} hours={HOURS} onLogin={onLogin} navigate={navigate} />);
  return { ...a, m, generate, load, navigate, onLogin, user };
}

const submit = () => screen.getByRole("button", { name: "오늘의 번호 생성" });

describe("M-19 사주 번호", () => {
  it("비로그인은 진입 차단·가입 유도, 프로필·엔진 호출 없음", async () => {
    const { load, generate, onLogin, user } = setup({ initial: { status: "signedOut" } });
    expect(screen.getByText("로그인이 필요해요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "오늘의 번호 생성" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "로그인·가입" }));
    expect(onLogin).toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("프로필이 없으면 M-18 입력 유도", async () => {
    const { navigate, user } = setup({ profile: null });
    expect(await screen.findByText("사주 프로필이 아직 없어요")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "프로필 입력하기" }));
    expect(navigate).toHaveBeenCalledWith("#/fortune/profile");
  });

  it.each<["SESSION_EXPIRED" | "FORBIDDEN", RegExp]>([
    ["SESSION_EXPIRED", /로그인이 만료됐어요/],
    ["FORBIDDEN", /권한이 없어요/],
  ])("프로필 조회 실패 %s: 코드별 안내와 다시 로그인", async (code, text) => {
    const a = makeAuth(SIGNED_IN);
    const onLogin = vi.fn();
    const load = vi.fn<SajuNumbersCore["fortuneProfile"]["load"]>(async () => ({ ok: false, code }));
    const m = mockGeneratorCore();
    const core = { ...(m.core as object), auth: a.auth, fortuneProfile: { load }, fortune: { generate: vi.fn() } } as unknown as SajuNumbersCore;
    const user = userEvent.setup();
    renderWithNotice(<SajuNumbers core={core} links={LINKS} hours={HOURS} onLogin={onLogin} navigate={() => {}} />);
    expect(await screen.findByText(text)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 로그인" }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it("프로필 읽기 실패는 재시도(온라인 필요 안내)", async () => {
    const a = makeAuth(SIGNED_IN);
    const load = vi
      .fn<SajuNumbersCore["fortuneProfile"]["load"]>()
      .mockResolvedValueOnce({ ok: false, code: "OFFLINE" })
      .mockResolvedValue({ ok: true, value: PROFILE });
    const m = mockGeneratorCore();
    const core = { ...(m.core as object), auth: a.auth, fortuneProfile: { load }, fortune: { generate: vi.fn() } } as unknown as SajuNumbersCore;
    const user = userEvent.setup();
    renderWithNotice(<SajuNumbers core={core} links={LINKS} hours={HOURS} onLogin={() => {}} navigate={() => {}} />);
    expect(await screen.findByText(/인터넷에 연결되어 있지 않아요/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("프로필 요약")).toBeInTheDocument();
  });

  it("프로필 요약·고지 표시, 생성은 saju 요청(양력·시진)으로 번호 5게임·출처 사주·저장 상태·고지", async () => {
    const { generate, user } = setup();
    expect(await screen.findByText("1990-03-15 (양력)")).toBeInTheDocument();
    expect(screen.getByText("묘시(05~07시)")).toBeInTheDocument();
    expect(screen.getByText("재미·참고용 · 전통 상징 해석이며 당첨 확률과 무관")).toBeInTheDocument();
    expect(screen.getByText(/기기에서 계산하며 같은 날 같은 결과/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "프로필 수정" })).toHaveAttribute("href", "#/fortune/profile");
    await user.click(submit());
    expect(generate).toHaveBeenCalledWith({ game: "lotto", theme: { kind: "saju", birth: { calendar: "solar", date: "1990-03-15", leap: false, hour: "myo" } } });
    expect(await screen.findByRole("heading", { name: "오늘의 사주 번호 (5게임)" })).toBeInTheDocument();
    expect(screen.getByText(/사주 출처/)).toHaveTextContent("사주 출처 사주 · 생성 이력에 저장됨");
    const first = screen.getByRole("list", { name: "1게임 번호" });
    expect(within(first).getAllByRole("listitem").map((li) => li.textContent)).toStrictEqual(["3", "9", "14", "25", "33", "42"]);
    expect(screen.getAllByText(/전통 상징 해석이며 당첨 확률과 무관/).length).toBeGreaterThanOrEqual(2);
  });

  it("연금 탭: 1~5조 요청, 음력 윤달·시각 모름 프로필은 그대로 엔진에 전달", async () => {
    const { generate, user } = setup({ profile: { birth_date: "1989-05-02", calendar: "lunar", is_leap_month: true, birth_hour: null } });
    expect(await screen.findByText("1989-05-02 (음력 윤달)")).toBeInTheDocument();
    expect(screen.getByText("모름")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "연금복권 720+" }));
    await user.click(submit());
    expect(generate).toHaveBeenCalledWith({
      game: "pension",
      groups: [1, 2, 3, 4, 5],
      theme: { kind: "saju", birth: { calendar: "lunar", date: "1989-05-02", leap: true, hour: null } },
    });
    expect(await screen.findByRole("heading", { name: "오늘의 사주 번호 (5장)" })).toBeInTheDocument();
  });

  it("생성 실패는 안내·재시도, 이전 결과 유지", async () => {
    const ok = vi.fn(async (): Promise<Result> => ({ batch_id: "b1", method: "saju", saved: true, records: NUMS.map((nums, i) => ({ id: `b1-${i}`, game: "lotto" as const, numbers: { nums }, group_no: null })) }));
    const generate = vi.fn().mockImplementationOnce(ok).mockRejectedValueOnce(new Error("boom")) as unknown as (r: FortuneRequestInput) => Promise<Result>;
    const { user } = setup({ generate });
    await user.click(await screen.findByRole("button", { name: "오늘의 번호 생성" }));
    await screen.findByRole("heading", { name: "오늘의 사주 번호 (5게임)" });
    await user.click(submit());
    expect(await screen.findByText("번호를 만들지 못했어요")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "오늘의 사주 번호 (5게임)" })).toBeInTheDocument();
  });

  it("로그아웃하면 프로필·결과가 즉시 사라지고, 늦게 끝난 이전 계정 생성은 버려진다", async () => {
    let finish: (v: Result) => void = () => {};
    const { set, user } = setup({ generate: () => new Promise<Result>((resolve) => (finish = resolve)) });
    await user.click(await screen.findByRole("button", { name: "오늘의 번호 생성" }));
    set({ status: "signedOut" });
    expect(screen.queryByText("프로필 요약")).not.toBeInTheDocument();
    expect(screen.getByText("로그인이 필요해요")).toBeInTheDocument();
    set({ status: "signedIn", user: { id: "u2" } });
    expect(await screen.findByText("프로필 요약")).toBeInTheDocument();
    await act(async () => finish({ batch_id: "late", method: "saju", saved: true, records: [] }));
    expect(screen.queryByText(/사주 출처/)).not.toBeInTheDocument();
    await waitFor(() => expect(submit()).toBeEnabled());
  });
});
