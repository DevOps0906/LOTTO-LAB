import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  turnstileSiteKey: "test-site-key",
  waitlistApiUrl: "https://api.test/functions/v1/waitlist",
  waitlistConfirmUrl: "",
}));

// Turnstile 위젯 대신 토큰을 바로 넘기는 가짜 버튼
vi.mock("@/components/Turnstile", () => ({
  Turnstile: ({ onToken }: { onToken: (t: string | null) => void }) => (
    <button type="button" onClick={() => onToken("ts-token")}>
      보안 확인 통과
    </button>
  ),
}));

import { WaitlistForm } from "@/components/WaitlistForm";

function mockFetch(status: number, headers: Record<string, string> = {}) {
  const fn = vi.fn().mockResolvedValue(new Response(status === 202 ? null : "{}", { status, headers }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function fillAll(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/이메일/), "me@example.com");
  await user.click(screen.getByRole("checkbox", { name: /수신에 동의/ }));
  await user.click(screen.getByRole("checkbox", { name: /만 19세 이상/ }));
  await user.click(screen.getByRole("button", { name: "보안 확인 통과" }));
}

const submit = () => screen.getByRole("button", { name: /사전알림 신청|신청 중/ });

describe("W-01 사전알림 폼", () => {
  it("필수 확인 전에는 신청 버튼이 비활성", async () => {
    const user = userEvent.setup();
    render(<WaitlistForm />);
    expect(submit()).toBeDisabled();
    await user.type(screen.getByLabelText(/이메일/), "me@example.com");
    expect(submit()).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /수신에 동의/ }));
    expect(submit()).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /만 19세 이상/ }));
    expect(submit()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "보안 확인 통과" }));
    expect(submit()).toBeEnabled();
  });

  it("202면 확인 메일 안내를 보이고 A-15 형식으로 보낸다", async () => {
    const fetchFn = mockFetch(202);
    const user = userEvent.setup();
    render(<WaitlistForm />);
    await fillAll(user);
    await user.click(submit());
    expect(await screen.findByText("확인 메일을 보냈어요 — 메일의 링크로 신청을 확정해 주세요")).toBeInTheDocument();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.test/functions/v1/waitlist");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      email: "me@example.com",
      consent_marketing: true,
      age_confirmed: true,
      turnstile_token: "ts-token",
    });
  });

  it("400이면 이메일 옆 안내, 입력은 보존", async () => {
    mockFetch(400);
    const user = userEvent.setup();
    render(<WaitlistForm />);
    await fillAll(user);
    await user.click(submit());
    expect(await screen.findByText(/이메일 주소를 확인한 뒤/)).toHaveAttribute("id", "waitlist-email-error");
    expect(screen.getByLabelText(/이메일/)).toHaveValue("me@example.com");
    expect(screen.getByLabelText(/이메일/)).toHaveFocus();
    expect(screen.getByRole("checkbox", { name: /수신에 동의/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /만 19세 이상/ })).toBeChecked();
  });

  it("이메일 형식이 틀리면 전송하지 않고 입력으로 포커스", async () => {
    const fetchFn = mockFetch(202);
    const user = userEvent.setup();
    render(<WaitlistForm />);
    await user.type(screen.getByLabelText(/이메일/), "not-an-email");
    await user.click(screen.getByRole("checkbox", { name: /수신에 동의/ }));
    await user.click(screen.getByRole("checkbox", { name: /만 19세 이상/ }));
    await user.click(screen.getByRole("button", { name: "보안 확인 통과" }));
    await user.click(submit());
    expect(await screen.findByText("이메일 주소 형식을 확인해 주세요.")).toBeInTheDocument();
    expect(screen.getByLabelText(/이메일/)).toHaveFocus();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("429면 잠시 후 재시도 안내(Retry-After), 입력은 보존", async () => {
    mockFetch(429, { "retry-after": "600" });
    const user = userEvent.setup();
    render(<WaitlistForm />);
    await fillAll(user);
    await user.click(submit());
    expect(await screen.findByText(/약 10분 후 다시 시도/)).toBeInTheDocument();
    expect(screen.getByLabelText(/이메일/)).toHaveValue("me@example.com");
    expect(screen.getByRole("checkbox", { name: /수신에 동의/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /만 19세 이상/ })).toBeChecked();
  });

  it("503이면 잠시 후 다시 안내", async () => {
    mockFetch(503);
    const user = userEvent.setup();
    render(<WaitlistForm />);
    await fillAll(user);
    await user.click(submit());
    expect(await screen.findByText(/일시적으로 신청을 받을 수 없어요/)).toBeInTheDocument();
    expect(screen.getByLabelText(/이메일/)).toHaveValue("me@example.com");
  });

  it("전송 중에는 잠기고 중복 제출되지 않는다", async () => {
    let resolve: (r: Response) => void = () => {};
    const fetchFn = vi.fn().mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchFn);
    const user = userEvent.setup();
    render(<WaitlistForm />);
    await fillAll(user);
    await user.click(submit());
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveTextContent("신청 중");
    await user.click(submit());
    expect(fetchFn).toHaveBeenCalledTimes(1);
    resolve(new Response(null, { status: 202 }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
});
