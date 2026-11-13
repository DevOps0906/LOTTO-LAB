import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import type { CoreState } from "../src/core.ts";
import { readHashPath } from "../src/router.ts";

const noCore: CoreState = { core: null, configError: true };

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

/** M-05를 통과한다(서비스 안내 확인 → 만 19세 이상 → 게스트로 시작). */
async function passOnboarding() {
  fireEvent.click(await screen.findByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("radio", { name: "네, 만 19세 이상입니다" }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "게스트로 시작" }));
  await screen.findByRole("navigation", { name: "하단 탭" });
}

afterEach(() => {
  window.location.hash = "";
});

describe("해시 라우팅", () => {
  it("하단 탭은 홈·추천·통계·내번호 4개다", async () => {
    render(<App core={noCore} />);
    await passOnboarding();
    const tabbar = screen.getByRole("navigation", { name: "하단 탭" });
    const labels = Array.from(tabbar.querySelectorAll("a")).map((a) => a.textContent);
    expect(labels).toEqual(["홈", "추천", "통계", "내번호"]);
  });

  it("해시가 바뀌면 화면 제목과 현재 탭이 바뀐다(하위 화면은 소속 탭)", async () => {
    render(<App core={noCore} />);
    await passOnboarding();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("홈");
    go("#/stats");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("통계");
    const tabbar = screen.getByRole("navigation", { name: "하단 탭" });
    expect(tabbar.querySelector('[aria-current="page"]')).toHaveAttribute("href", "#/stats");
    go("#/generate/lotto");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("로또 번호 생성");
    expect(tabbar.querySelector('[aria-current="page"]')).toHaveAttribute("href", "#/generate");
  });


  it("모르는 경로는 홈으로 본다", async () => {
    go("#/nowhere");
    render(<App core={noCore} />);
    await passOnboarding();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("홈"));
    expect(readHashPath("")).toBe("/");
    expect(readHashPath("#tickets")).toBe("/");
  });

  it("설정이 없으면 안내를 보인다", async () => {
    render(<App core={noCore} />);
    await passOnboarding();
    expect(screen.getByText("서버 연결 설정이 없습니다")).toBeInTheDocument();
  });
});
