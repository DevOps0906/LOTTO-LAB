// D-07 Windows 구매 등록 = M-09 PurchaseRegister layout="wide": 중복 등록 경고(같은 회차·같은 번호 구매 기록), 멱등 키 유지(중복 제출 1건).
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PurchaseRegister } from "../src";
import { fakeTicketsCore, favorite, purchased, renderWithNotice } from "./ticket-core";

const links = { tickets: "#/tickets", detail: (id: string) => `#/tickets/${id}` };
const TODAY = "2026-11-12";
const NUMS = ["3", "9", "14", "25", "33", "42"];

async function typeLotto(nums: string[]) {
  for (const [i, n] of nums.entries()) {
    const input = screen.getByRole("textbox", { name: `로또 번호 ${i + 1}` });
    await userEvent.clear(input);
    await userEvent.type(input, n);
  }
}

describe("D-07 Windows 구매 등록(M-09 wide)", () => {
  it("같은 회차·같은 번호 구매 기록이 있으면 경고 + 기존 기록 링크, 다른 번호면 경고 없음", async () => {
    const old = purchased({ game: "lotto", ticket_data: { nums: [3, 9, 14, 25, 33, 42] }, round: 1133 });
    const fav = favorite({ game: "lotto", ticket_data: { nums: [1, 2, 3, 4, 5, 6] } });
    const f = fakeTicketsCore({ tickets: [old, fav] });
    renderWithNotice(<PurchaseRegister core={f.core} links={links} navigate={vi.fn()} today={TODAY} layout="wide" />);
    await screen.findByDisplayValue("1133");
    // 번호 순서가 달라도 같은 번호
    await typeLotto([...NUMS].reverse());
    const warning = await screen.findByText("중복 등록 확인");
    expect(warning.closest("p")).toHaveAttribute("role", "status");
    expect(screen.getByRole("link", { name: "기존 기록 보기" })).toHaveAttribute("href", `#/tickets/${old.id}`);
    // 회차가 다르면 경고 없음
    const round = screen.getByRole("textbox", { name: "회차" });
    await userEvent.clear(round);
    await userEvent.type(round, "1132");
    expect(screen.queryByText("중복 등록 확인")).toBeNull();
    // 즐겨찾기(미구매)와 같은 번호는 중복이 아니다
    await userEvent.clear(round);
    await userEvent.type(round, "1133");
    await typeLotto(["1", "2", "3", "4", "5", "6"]);
    expect(screen.queryByText("중복 등록 확인")).toBeNull();
  });

  it("경고가 있어도 등록할 수 있고(같은 번호 두 장), 두 번 눌러도 1건(멱등 키 유지)", async () => {
    const old = purchased({ game: "lotto", ticket_data: { nums: [3, 9, 14, 25, 33, 42] }, round: 1133 });
    const f = fakeTicketsCore({ tickets: [old] });
    const navigate = vi.fn();
    renderWithNotice(<PurchaseRegister core={f.core} links={links} navigate={navigate} today={TODAY} layout="wide" />);
    await screen.findByDisplayValue("1133");
    await typeLotto(NUMS);
    await screen.findByText("중복 등록 확인");
    await userEvent.click(screen.getByRole("checkbox", { name: "실제로 구매한 번호가 맞습니다(필수)" }));
    const submit = screen.getByRole("button", { name: "구매 등록 확정" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(f.tickets.newIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(f.tickets.save).toHaveBeenCalledTimes(1);
    expect([...f.store.values()].filter((t) => t.purchase_status === "purchased")).toHaveLength(2);
  });

  it("연금 1조 000719: 문자열 그대로 비교·저장", async () => {
    const old = purchased({ game: "pension", ticket_data: { group_no: 1, digits: "000719" }, round: 291 });
    const f = fakeTicketsCore({ tickets: [old] });
    renderWithNotice(<PurchaseRegister core={f.core} links={links} navigate={vi.fn()} today={TODAY} layout="wide" />);
    await screen.findByDisplayValue("1133");
    await userEvent.click(screen.getByRole("radio", { name: "연금복권 720+" }));
    await userEvent.click(screen.getByRole("radio", { name: "1조" }));
    await userEvent.type(screen.getByRole("textbox", { name: "여섯 자리" }), "000719");
    await screen.findByDisplayValue("291");
    expect(await screen.findByText("중복 등록 확인")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "여섯 자리" })).toHaveValue("000719");
  });

  it("모바일(stack)은 기존 목록을 읽지 않는다(중복 경고 없음)", async () => {
    const f = fakeTicketsCore({ tickets: [purchased({ game: "lotto", ticket_data: { nums: [3, 9, 14, 25, 33, 42] }, round: 1133 })] });
    renderWithNotice(<PurchaseRegister core={f.core} links={links} navigate={vi.fn()} today={TODAY} />);
    await screen.findByDisplayValue("1133");
    await typeLotto(NUMS);
    expect(screen.queryByText("중복 등록 확인")).toBeNull();
    expect(f.tickets.list).not.toHaveBeenCalled();
  });
});
