import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SajuNumbers, type FortuneRequestInput, type SajuAuthState, type SajuNumbersCore, type SajuProfile } from "../src";
import type { SajuChart } from "../src/screens/M-19/SajuChartCard";
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

const P = (stem: string, branch: string, stemElement: string, branchElement: string) => ({ stem, branch, stemElement, branchElement });
const CHART_OK: SajuChart = {
  ok: true,
  pillars: { year: P("경", "오", "금", "화"), month: P("기", "묘", "토", "목"), day: P("경", "진", "금", "토"), hour: P("신", "사", "금", "화") },
  elements: { 목: 1, 화: 2, 토: 2, 금: 3, 수: 0 },
  boundary: false,
};
const CHART_FAIL: SajuChart = { ok: false, reason: "UNCONVERTIBLE_DATE" };

type Result = Awaited<ReturnType<SajuNumbersCore["fortune"]["generate"]>>;

function setup(options: { initial?: SajuAuthState; profile?: SajuProfile | null; generate?: (r: FortuneRequestInput) => Promise<Result>; chart?: SajuChart } = {}) {
  const sajuChart = vi.fn<SajuNumbersCore["fortune"]["sajuChart"]>(() => options.chart ?? CHART_OK);
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
  const core = { ...(m.core as object), auth: a.auth, fortuneProfile: { load }, fortune: { generate, sajuChart } } as unknown as SajuNumbersCore;
  const navigate = vi.fn();
  const onLogin = vi.fn();
  const user = userEvent.setup();
  renderWithNotice(<SajuNumbers core={core} links={LINKS} hours={HOURS} onLogin={onLogin} navigate={navigate} />);
  return { ...a, m, generate, load, navigate, onLogin, sajuChart, user };
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
    const core = { ...(m.core as object), auth: a.auth, fortuneProfile: { load }, fortune: { generate: vi.fn(), sajuChart: () => CHART_OK } } as unknown as SajuNumbersCore;
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
    const core = { ...(m.core as object), auth: a.auth, fortuneProfile: { load }, fortune: { generate: vi.fn(), sajuChart: () => CHART_OK } } as unknown as SajuNumbersCore;
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

  it("사주 표: 4주·오행 글자 수·기준·번호 비결정 고지, 프로필 입력으로 계산, 금지어 없음", async () => {
    const { sajuChart } = setup();
    const card = (await screen.findByRole("heading", { name: "사주 표" })).closest(".ll-card") as HTMLElement;
    expect(sajuChart).toHaveBeenCalledWith({ date: "1990-03-15", calendar: "solar", leap: false, hour: "myo" });
    expect(within(card).getAllByText("경 (금)").length).toBeGreaterThan(0);
    expect(within(card).getByText("목").nextElementSibling).toHaveTextContent("1글자");
    expect(within(card).getByText("수").nextElementSibling).toHaveTextContent("0글자");
    expect(within(card).getByText(/천간·지지 본기 글자 수\(지장간 제외\), 총 8글자/)).toBeInTheDocument();
    expect(within(card).getByText("한국 표준시 기준, 진태양시 보정 없음")).toBeInTheDocument();
    expect(within(card).getByText("번호는 이 표로 정하지 않습니다")).toBeInTheDocument();
    expect(within(card).queryByText(/절입 경계/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/야자시/)).not.toBeInTheDocument();
    // 강·약·부족·용신·해석·보완·추천 오행 등 해석·강조 문구 금지(고정 고지는 카드 밖)
    expect(card.textContent).not.toMatch(/강하|약하|부족|과다|용신|해석|보완|보충|필요한 오행|좋은 오행|행운|길(?:하|한)/);
  });

  const OK_CHART = CHART_OK as Extract<SajuChart, { ok: true }>;

  it("사주 표: 시진 모름(null)은 시주 '모름'·총 6글자, 자시 안내 없음", async () => {
    setup({
      profile: { birth_date: "2024-03-01", calendar: "solar", is_leap_month: false, birth_hour: null },
      chart: { ...OK_CHART, pillars: { ...OK_CHART.pillars, hour: null } },
    });
    const card = (await screen.findByRole("heading", { name: "사주 표" })).closest(".ll-card") as HTMLElement;
    expect(within(card).getAllByText("모름").length).toBeGreaterThan(0);
    expect(within(card).getByText(/총 6글자/)).toBeInTheDocument();
    expect(within(card).queryByText(/야자시/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/절입 경계/)).not.toBeInTheDocument();
  });

  it("사주 표: 자시 선택은 입력 날짜 기준 안내, 절입 경계 안내는 boundary일 때만", async () => {
    setup({
      profile: { birth_date: "2024-02-04", calendar: "solar", is_leap_month: false, birth_hour: "ja" },
      chart: { ...OK_CHART, boundary: true },
    });
    const card = (await screen.findByRole("heading", { name: "사주 표" })).closest(".ll-card") as HTMLElement;
    expect(within(card).getByText(/자시\(23~01시\)는 입력한 날짜 기준.*야자시 학파는 다를 수 있음/)).toBeInTheDocument();
    expect(within(card).getByText("절입 경계 — 출생 시각에 따라 년주·월주가 다를 수 있습니다")).toBeInTheDocument();
    expect(within(card).getByText(/총 8글자/)).toBeInTheDocument();
  });

  it("변환할 수 없는 날짜: 사주 표 대신 안내·프로필 수정, 번호 생성은 그대로 가능", async () => {
    const { generate, navigate, user } = setup({ chart: CHART_FAIL });
    expect(await screen.findByText("변환할 수 없는 날짜")).toBeInTheDocument();
    expect(screen.queryByText("번호는 이 표로 정하지 않습니다")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "프로필 수정" }));
    expect(navigate).toHaveBeenCalledWith("#/fortune/profile");
    await user.click(submit());
    expect(generate).toHaveBeenCalledWith({ game: "lotto", theme: { kind: "saju", birth: { calendar: "solar", date: "1990-03-15", leap: false, hour: "myo" } } });
    expect(await screen.findByRole("heading", { name: "오늘의 사주 번호 (5게임)" })).toBeInTheDocument();
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
