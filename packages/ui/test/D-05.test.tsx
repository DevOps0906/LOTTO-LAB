// D-05 Windows 내 번호 = M-07 MyTickets layout="wide": 넓은 표·선택·정렬(구매일·금액)·판정 필터·CSV 내보내기(범위·건수 미리보기·빈 CSV 방지).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MyTickets, type CsvExporter, type TicketOutcome } from "../src";
import { fakeTicketsCore, favorite, purchased, renderWithNotice } from "./ticket-core";

const links = {
  generate: "#/lotto",
  settings: "#/settings",
  register: "#/tickets/register",
  registerFrom: (id: string) => `#/tickets/register?ticket=${id}`,
  check: "#/tickets/check",
  detail: (id: string) => `#/tickets/${id}`,
};

const P1 = purchased({ game: "pension", ticket_data: { group_no: 1, digits: "000719" }, round: 290, amount_won: 1000, purchase_date: "2026-11-05" });
const L1 = purchased({ game: "lotto", ticket_data: { nums: [3, 9, 14, 25, 33, 42] }, round: 1132, amount_won: 5000, purchase_date: "2026-11-01" });
const F1 = favorite({ game: "lotto", ticket_data: { nums: [1, 2, 3, 4, 5, 6] } });

function exporter() {
  const tickets = vi.fn<CsvExporter["tickets"]>(async () => "saved");
  const summary = vi.fn<CsvExporter["summary"]>(async () => "saved");
  return { csv: { tickets, summary } satisfies CsvExporter, tickets };
}

function setup() {
  const f = fakeTicketsCore({ tickets: [P1, L1, F1] });
  // L1은 3등(대조 완료), P1은 결과 대기
  f.judge.mockImplementation((t): TicketOutcome =>
    t.id === L1.id
      ? {
          ticket: t,
          status: "checked",
          draw_no: 1132,
          result: { matched_rank: 3, bonus_hit: false },
          source_url: "https://www.dhlottery.co.kr/x",
          source_verified_at: "2026-11-07T12:05:00.000Z",
          fetched_at: "2026-11-08T00:00:00.000Z",
          stale: false,
        }
      : { ticket: t, status: "pending", stale: false },
  );
  return f;
}

async function table() {
  return screen.findByRole("region", { name: "구매 기록 표 영역(가로 스크롤)" });
}

describe("D-05 Windows 내 번호(M-07 wide)", () => {
  it("넓은 표: 선택·회차·복권·조·번호 문자열·구매일·금액·상태·판정·검증 시각, 연금 000719 그대로", async () => {
    const f = setup();
    const { csv } = exporter();
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={vi.fn()} initialTab="purchased" layout="wide" csv={csv} canShare={false} />);
    const region = await table();
    const heads = within(region).getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads.slice(0, 10)).toEqual(["", "회차", "복권", "조", "번호", "구매일", "금액(원)", "구매 상태", "판정", "검증 시각"]);
    await within(region).findByText("3등");
    const rows = within(region).getAllByRole("row").slice(1);
    const pension = rows.find((r) => r.textContent?.includes("000719"))!;
    expect(within(pension).getByText("000719")).toHaveClass("ll-mono");
    expect(within(pension).getByText("1조")).toBeInTheDocument();
    expect(within(pension).getByText("1,000원")).toBeInTheDocument();
    expect(within(pension).getByText("결과 대기")).toBeInTheDocument();
    const lotto = rows.find((r) => r.textContent?.includes("3 9 14 25 33 42"))!;
    expect(within(lotto).getByRole("link")).toHaveAttribute("href", `#/tickets/${L1.id}`);
    expect(within(lotto).getByText("3등")).toBeInTheDocument();
    expect(lotto.querySelector("time")).toHaveAttribute("dateTime", "2026-11-07T12:05:00.000Z");
    // Windows: 공유 메뉴 없음(복사와 중복)
    await userEvent.click(within(lotto).getByRole("button", { name: /메뉴$/ }));
    expect(screen.queryByRole("menuitem", { name: "공유" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "복사" })).toBeInTheDocument();
  });

  it("즐겨찾기 탭: 판정은 '대상 아님'(미구매 대조 제외)", async () => {
    const f = setup();
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={vi.fn()} initialTab="favorite" layout="wide" />);
    const region = await screen.findByRole("region", { name: "즐겨찾기 표 영역(가로 스크롤)" });
    const row = within(region).getAllByRole("row")[1]!;
    expect(within(row).getByText("대상 아님")).toBeInTheDocument();
    expect(within(row).getByText("즐겨찾기")).toBeInTheDocument();
    expect(f.checkPurchased).not.toHaveBeenCalled();
  });

  it("정렬: 금액순·구매일순(사용자 기록 정렬), 판정 필터: 당첨만", async () => {
    const f = setup();
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={vi.fn()} initialTab="purchased" layout="wide" />);
    await within(await table()).findByText("3등");
    const numbers = () =>
      within(screen.getByRole("region", { name: "구매 기록 표 영역(가로 스크롤)" }))
        .getAllByRole("row")
        .slice(1)
        .map((r) => r.querySelectorAll("td")[3]!.textContent);
    await userEvent.click(screen.getByRole("radio", { name: "금액순" }));
    expect(numbers()).toEqual(["3 9 14 25 33 42", "000719"]);
    await userEvent.click(screen.getByRole("radio", { name: "구매일순" }));
    expect(numbers()).toEqual(["000719", "3 9 14 25 33 42"]);
    await userEvent.click(screen.getByRole("radio", { name: "당첨" }));
    expect(numbers()).toEqual(["3 9 14 25 33 42"]);
    await userEvent.click(screen.getByRole("radio", { name: "낙첨" }));
    expect(await screen.findByText("조건에 맞는 번호가 없습니다")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(numbers()).toHaveLength(2);
  });

  it("CSV: 필터 전체 범위·건수 미리보기 → 저장, 연금 번호는 문자열·조 분리", async () => {
    const f = setup();
    const { csv, tickets } = exporter();
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={vi.fn()} initialTab="purchased" layout="wide" csv={csv} />);
    await within(await table()).findByText("3등");
    expect(screen.getByText("내보낼 범위: 구매 기록 현재 검색·필터 결과 전체 2건")).toBeInTheDocument();
    expect(screen.getByText(/연금 여섯 자리 번호는 앞자리 0이 지워지지 않게 텍스트로 저장합니다/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "CSV 내보내기 (2건)" }));
    await waitFor(() => expect(tickets).toHaveBeenCalledTimes(1));
    const rows = tickets.mock.calls[0]![0];
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.game === "pension")).toEqual({
      round: 290,
      game: "pension",
      group_no: 1,
      numbers: "000719",
      purchase_date: "2026-11-05",
      amount_won: 1000,
      status: "구매 기록",
      result: "결과 대기",
      verified_at: null,
    });
    expect(rows.find((r) => r.game === "lotto")).toMatchObject({ numbers: "3 9 14 25 33 42", result: "3등", verified_at: "2026-11-07T12:05:00.000Z" });
    expect(await screen.findByText("CSV로 2건을 저장했어요")).toBeInTheDocument();
  });

  it("CSV: 선택 범위 — 0건이면 막고(빈 CSV 방지), 선택한 행만 내보낸다", async () => {
    const f = setup();
    const { csv, tickets } = exporter();
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={vi.fn()} initialTab="purchased" layout="wide" csv={csv} />);
    const region = await table();
    await within(region).findByText("3등");
    await userEvent.click(screen.getByRole("radio", { name: "선택 0건" }));
    expect(screen.getByRole("button", { name: "CSV 내보내기 (0건)" })).toBeDisabled();
    expect(screen.getByText("선택한 행이 없어 내보낼 수 없습니다. 표에서 행을 선택하세요.")).toBeInTheDocument();
    await userEvent.click(within(region).getByRole("checkbox", { name: "연금복권 720+ 1조 000719 선택" }));
    await userEvent.click(screen.getByRole("button", { name: "CSV 내보내기 (1건)" }));
    await waitFor(() => expect(tickets).toHaveBeenCalledTimes(1));
    expect(tickets.mock.calls[0]![0].map((r) => r.numbers)).toEqual(["000719"]);
    // 보이는 행 모두 선택
    await userEvent.click(within(region).getByRole("checkbox", { name: "보이는 행 모두 선택" }));
    expect(screen.getByRole("button", { name: "CSV 내보내기 (2건)" })).toBeEnabled();
  });

  it("CSV 실패: 표는 그대로, 오류 안내 + 다시 시도 / 대화상자 취소는 조용히", async () => {
    const f = setup();
    const { csv, tickets } = exporter();
    tickets.mockRejectedValueOnce(new Error("WRITE_FAILED")).mockResolvedValueOnce("cancelled");
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={vi.fn()} initialTab="purchased" layout="wide" csv={csv} />);
    const region = await table();
    await within(region).findByText("3등");
    await userEvent.click(screen.getByRole("button", { name: "CSV 내보내기 (2건)" }));
    expect(await screen.findByText("CSV를 저장하지 못했어요. 저장 위치를 확인한 뒤 다시 시도하세요.")).toHaveAttribute("role", "alert");
    expect(within(region).getAllByRole("row")).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(tickets).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/CSV를 저장하지 못했어요/)).toBeNull();
    expect(screen.queryByText(/CSV로 .*저장했어요/)).toBeNull();
  });

  it("CSV 내보내기가 없으면(모바일 등) 막대를 숨기고, 빈 탭은 생성/등록 안내", async () => {
    const f = fakeTicketsCore();
    renderWithNotice(<MyTickets core={f.core} links={links} navigate={vi.fn()} initialTab="purchased" layout="wide" />);
    expect(await screen.findByText("구매 기록이 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "CSV 내보내기" })).toBeNull();
  });
});
