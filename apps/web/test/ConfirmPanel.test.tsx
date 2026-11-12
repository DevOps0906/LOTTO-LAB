import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  turnstileSiteKey: "",
  waitlistApiUrl: "",
  waitlistConfirmUrl: "https://api.test/functions/v1/waitlist-confirm",
}));

import { ConfirmPanel } from "@/components/ConfirmPanel";

const TOKEN = "secret-token-abc";

function mockFetch(status: number, headers: Record<string, string> = {}) {
  const fn = vi.fn().mockResolvedValue(new Response("{}", { status, headers }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("W-05 사전알림 확인", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", `/waitlist/confirm#token=${TOKEN}`);
  });

  it("페이지 로드만으로는 호출하지 않고, 해시의 토큰은 바로 지운다", async () => {
    const fetchFn = mockFetch(200);
    render(<ConfirmPanel />);
    expect(await screen.findByRole("button", { name: "신청 확정하기" })).toBeEnabled();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("");
    expect(window.location.href).not.toContain(TOKEN);
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("버튼을 눌러야 A-19로 POST {token} 하고 완료 안내", async () => {
    const fetchFn = mockFetch(200);
    const user = userEvent.setup();
    render(<ConfirmPanel />);
    await user.click(await screen.findByRole("button", { name: "신청 확정하기" }));
    expect(await screen.findByText("사전알림 신청이 확정되었어요")).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.test/functions/v1/waitlist-confirm");
    expect(String(url)).not.toContain(TOKEN);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN });
  });

  it("400이면 만료·올바르지 않음 안내와 다시 신청 링크", async () => {
    mockFetch(400);
    const user = userEvent.setup();
    render(<ConfirmPanel />);
    await user.click(await screen.findByRole("button", { name: "신청 확정하기" }));
    expect(await screen.findByText("링크가 만료되었거나 올바르지 않아요 — 다시 신청해 주세요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "랜딩에서 다시 신청하기" })).toHaveAttribute("href", "/#waitlist");
  });

  it("429면 재시도 안내 후 버튼을 다시 누를 수 있다", async () => {
    mockFetch(429, { "retry-after": "60" });
    const user = userEvent.setup();
    render(<ConfirmPanel />);
    await user.click(await screen.findByRole("button", { name: "신청 확정하기" }));
    expect(await screen.findByText(/약 1분 후 다시 시도/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "신청 확정하기" })).toBeEnabled();
  });

  it("503이면 잠시 후 다시 안내", async () => {
    mockFetch(503);
    const user = userEvent.setup();
    render(<ConfirmPanel />);
    await user.click(await screen.findByRole("button", { name: "신청 확정하기" }));
    expect(await screen.findByText(/일시적으로 확정할 수 없어요/)).toBeInTheDocument();
  });

  it("토큰이 없으면 링크 다시 받기 안내, 버튼 없음", async () => {
    window.history.replaceState(null, "", "/waitlist/confirm");
    const fetchFn = mockFetch(200);
    render(<ConfirmPanel />);
    expect(await screen.findByText("확인 링크를 찾을 수 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "신청 확정하기" })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("쿼리스트링 토큰(?token=)은 받지 않는다", async () => {
    window.history.replaceState(null, "", `/waitlist/confirm?token=${TOKEN}`);
    const fetchFn = mockFetch(200);
    render(<ConfirmPanel />);
    expect(await screen.findByText("확인 링크를 찾을 수 없어요")).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
