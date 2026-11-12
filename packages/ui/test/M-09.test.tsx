import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PurchaseRegister } from "../src";
import { fakeTicketsCore, favorite, purchased, renderWithNotice } from "./ticket-core";

const links = { tickets: "#/tickets", detail: (id: string) => `#/tickets/${id}` };
const TODAY = "2026-11-12";

function setup(init: Parameters<typeof fakeTicketsCore>[0] = {}) {
  const f = fakeTicketsCore(init);
  const navigate = vi.fn();
  return { ...f, navigate };
}

async function fillPension(group: string, digits: string) {
  await userEvent.click(screen.getByRole("radio", { name: "연금복권 720+" }));
  await userEvent.click(screen.getByRole("radio", { name: group }));
  await userEvent.type(screen.getByRole("textbox", { name: "여섯 자리" }), digits);
}

describe("M-09 수동 구매 등록", () => {
  it("실제 구매 확인 체크 전에는 확정 비활성, 회차 기본값(suggestRound)·구매일 KST 오늘·금액 1,000원", async () => {
    const f = setup();
    renderWithNotice(<PurchaseRegister core={f.core} links={links} navigate={f.navigate} today={TODAY} />);
    expect(await screen.findByDisplayValue("1133")).toBeInTheDocument();
    expect(screen.getByLabelText("구매일")).toHaveValue(TODAY);
    expect(screen.getByRole("radio", { name: "1,000원" })).toBeChecked();
    const submit = screen.getByRole("button", { name: "구매 등록 확정" });
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: "실제로 구매한 번호가 맞습니다(필수)" }));
    expect(submit).toBeEnabled();
    expect(screen.queryByText(/QR/)).toBeNull();
    expect(screen.getByText(/복권을 판매하거나 결제하지 않습니다/)).toBeInTheDocument();
  });

  it("연금 000719: 문자열 그대로 저장(숫자 변환 없음), 멱등 키는 진입 시 1번, 두 번 제출해도 1건", async () => {
    const f = setup();
    renderWithNotice(<PurchaseRegister core={f.core} links={links} navigate={f.navigate} today={TODAY} />);
    await screen.findByDisplayValue("1133");
    await fillPension("1조", "000719");
    expect(screen.getByRole("textbox", { name: "여섯 자리" })).toHaveValue("000719");
    // 복권을 바꾸면 회차 제안도 그 복권 기준
    expect(await screen.findByDisplayValue("291")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "실제로 구매한 번호가 맞습니다(필수)" }));
    const submit = screen.getByRole("button", { name: "구매 등록 확정" });
    // 두 번 누름(같은 틱) → 저장 요청은 잠금으로 1번
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(f.navigate).toHaveBeenCalled());
    expect(f.tickets.newIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(f.tickets.save).toHaveBeenCalledTimes(1);
    expect(f.tickets.save).toHaveBeenCalledWith({
      game: "pension",
      ticket_data: { group_no: 1, digits: "000719" },
      purchase_status: "purchased",
      purchase_date: TODAY,
      amount_won: 1000,
      round: 291,
      idempotency_key: "10000000-0000-4000-8000-000000000001",
    });
    expect(f.store.size).toBe(1);
    const [saved] = [...f.store.values()];
    expect(saved!.ticket_data).toStrictEqual({ group_no: 1, digits: "000719" });
    expect(f.navigate).toHaveBeenCalledWith(`#/tickets/${saved!.id}`);
  });

  it("저장 실패 후 다시 제출: 입력 유지 + 같은 멱등 키 재사용 → 기록 1건", async () => {
    const f = setup();
    f.tickets.save.mockRejectedValueOnce(Object.assign(new Error("io"), { code: "STORAGE_FAILED" }));
    renderWithNotice(<PurchaseRegister core={f.core} links={links} navigate={f.navigate} today={TODAY} />);
    await screen.findByDisplayValue("1133");
    for (const [i, n] of ["45", "3", "12", "7", "33", "21"].entries()) {
      await userEvent.type(screen.getByRole("textbox", { name: `로또 번호 ${i + 1}` }), n);
    }
    await userEvent.click(screen.getByRole("checkbox", { name: "실제로 구매한 번호가 맞습니다(필수)" }));
    await userEvent.click(screen.getByRole("button", { name: "구매 등록 확정" }));
    expect(await screen.findByText(/등록하지 못했어요/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "로또 번호 1" })).toHaveValue("45");
    await userEvent.click(screen.getByRole("button", { name: "구매 등록 확정" }));
    await waitFor(() => expect(f.navigate).toHaveBeenCalled());
    const keys = f.tickets.save.mock.calls.map((c) => c[0].idempotency_key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
    expect(f.tickets.save.mock.calls[1]![0]).toMatchObject({ game: "lotto", ticket_data: { nums: [3, 7, 12, 21, 33, 45] } });
    expect(f.store.size).toBe(1);
  });

  it("필드 옆 오류: 로또 범위·중복, 연금 자리 수, 회차, 미래 구매일, 금액 직접 입력", async () => {
    const f = setup();
    f.tickets.suggestRound.mockResolvedValue({ round: 1140, needs_confirmation: true });
    renderWithNotice(<PurchaseRegister core={f.core} links={links} navigate={f.navigate} today={TODAY} />);
    // needs_confirmation이면 회차를 채우지 않고 확인을 요구한다
    expect(await screen.findByText(/회차를 채우지 않았어요/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "회차" })).toHaveValue("");
    await userEvent.type(screen.getByRole("textbox", { name: "로또 번호 1" }), "46");
    await userEvent.type(screen.getByRole("textbox", { name: "로또 번호 2" }), "1");
    fireEvent.change(screen.getByLabelText("구매일"), { target: { value: "2026-11-13" } });
    await userEvent.click(screen.getByRole("radio", { name: "직접 입력" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "실제로 구매한 번호가 맞습니다(필수)" }));
    await userEvent.click(screen.getByRole("button", { name: "구매 등록 확정" }));
    expect(screen.getByText("1~45 사이 서로 다른 숫자 6개를 입력하세요.")).toBeInTheDocument();
    expect(screen.getByText(/구매한 복권에 적힌 회차/)).toBeInTheDocument();
    expect(screen.getByText("구매일은 오늘 이후일 수 없어요.")).toBeInTheDocument();
    expect(screen.getByText("금액은 원 단위 정수(숫자만)로 입력하세요.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "회차" })).toHaveAttribute("aria-invalid", "true");
    expect(f.tickets.save).not.toHaveBeenCalled();
    // 연금 자리 수
    await userEvent.click(screen.getByRole("radio", { name: "연금복권 720+" }));
    await userEvent.type(screen.getByRole("textbox", { name: "여섯 자리" }), "0719");
    await userEvent.click(screen.getByRole("button", { name: "구매 등록 확정" }));
    expect(screen.getByText("조(1~5조)를 고르세요.")).toBeInTheDocument();
    expect(screen.getByText(/여섯 자리 숫자를 입력하세요/)).toBeInTheDocument();
  });

  it("제출 오류 시 첫 오류 필드로 포커스(로또 번호 → 해결 후 회차)", async () => {
    const f = setup();
    f.tickets.suggestRound.mockResolvedValue({ round: null, needs_confirmation: true });
    renderWithNotice(<PurchaseRegister core={f.core} links={links} navigate={f.navigate} today={TODAY} />);
    await screen.findByText(/회차를 채우지 않았어요/);
    await userEvent.click(screen.getByRole("checkbox", { name: "실제로 구매한 번호가 맞습니다(필수)" }));
    await userEvent.click(screen.getByRole("button", { name: "구매 등록 확정" }));
    expect(screen.getByRole("textbox", { name: "로또 번호 1" })).toHaveFocus();
    for (const [i, n] of ["1", "2", "3", "4", "5", "6"].entries()) {
      await userEvent.type(screen.getByRole("textbox", { name: `로또 번호 ${i + 1}` }), n);
    }
    await userEvent.click(screen.getByRole("button", { name: "구매 등록 확정" }));
    expect(screen.getByRole("textbox", { name: "회차" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "회차" })).toHaveAccessibleDescription(/구매한 복권에 적힌 회차/);
  });

  it("회차는 나중에 입력 → round null로 저장(판정 대상 아님), 금액 입력 안 함 → null", async () => {
    const f = setup();
    renderWithNotice(<PurchaseRegister core={f.core} links={links} navigate={f.navigate} today={TODAY} />);
    await fillPension("5조", "123456");
    await userEvent.click(screen.getByRole("checkbox", { name: /회차는 나중에 입력/ }));
    await userEvent.click(screen.getByRole("radio", { name: "입력 안 함" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "실제로 구매한 번호가 맞습니다(필수)" }));
    await userEvent.click(screen.getByRole("button", { name: "구매 등록 확정" }));
    await waitFor(() => expect(f.tickets.save).toHaveBeenCalledWith(expect.objectContaining({ round: null, amount_won: null })));
  });

  it("즐겨찾기 → 구매로 등록: 같은 기록을 전환(번호 고정, 새 기록 없음), 회차 입력", async () => {
    const fav = favorite({ game: "pension", ticket_data: { group_no: 2, digits: "000719" }, source_number_id: "00000000-0000-4000-8000-0000000000aa" });
    const f = setup({ tickets: [fav] });
    renderWithNotice(<PurchaseRegister core={f.core} links={links} navigate={f.navigate} today={TODAY} fromTicketId={fav.id} />);
    expect(await screen.findByText(/즐겨찾기 번호를 구매 기록으로 바꿉니다/)).toBeInTheDocument();
    expect(screen.getByText("000719")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "여섯 자리" })).toBeNull();
    expect(await screen.findByDisplayValue("291")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "실제로 구매한 번호가 맞습니다(필수)" }));
    await userEvent.click(screen.getByRole("button", { name: "구매 등록 확정" }));
    await waitFor(() => expect(f.navigate).toHaveBeenCalledWith(`#/tickets/${fav.id}`));
    expect(f.tickets.purchase).toHaveBeenCalledTimes(1);
    expect(f.tickets.purchase).toHaveBeenCalledWith(fav.id, { round: 291, purchase_date: TODAY, amount_won: 1000 });
    expect(f.tickets.changeStatus).not.toHaveBeenCalled();
    expect(f.tickets.setRound).not.toHaveBeenCalled();
    expect(f.tickets.save).not.toHaveBeenCalled();
    expect(f.store.size).toBe(1);
    expect(f.store.get(fav.id)).toMatchObject({ purchase_status: "purchased", round: 291, ticket_data: { digits: "000719" } });
  });

  it("이미 구매 기록이거나 없는 번호면 안내", async () => {
    const bought = purchased({ game: "lotto", ticket_data: { nums: [1, 2, 3, 4, 5, 6] }, round: 1 });
    const f = setup({ tickets: [bought] });
    const { unmount } = renderWithNotice(<PurchaseRegister core={f.core} links={links} navigate={f.navigate} today={TODAY} fromTicketId={bought.id} />);
    expect(await screen.findByText("이미 구매 기록인 번호입니다")).toBeInTheDocument();
    unmount();
    renderWithNotice(<PurchaseRegister core={f.core} links={links} navigate={f.navigate} today={TODAY} fromTicketId="missing" />);
    expect(await screen.findByText("구매로 등록할 번호를 찾을 수 없습니다")).toBeInTheDocument();
  });
});
