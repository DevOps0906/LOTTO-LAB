import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import type { CoreState } from "../src/core.ts";

const noCore: CoreState = { core: null, configError: true };

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

/** D-11을 통과한다(서비스 안내 확인 → 만 19세 이상 → 게스트로 시작). */
async function passOnboarding() {
  fireEvent.click(await screen.findByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("radio", { name: "네, 만 19세 이상입니다" }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "게스트로 시작" }));
  await screen.findByRole("navigation", { name: "주 메뉴" });
}

afterEach(() => {
  window.location.hash = "";
});

describe("D-11 첫 실행 19세 확인", () => {
  it("확인 전에는 사이드바 없이 창 가운데 카드(M-05 재사용)만 보인다", async () => {
    const { container } = render(<App core={noCore} />);
    expect(await screen.findByRole("checkbox")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "주 메뉴" })).toBeNull();
    expect(container.querySelector(".app-center > .ll-onboarding")).toHaveAttribute("data-layout", "card");
  });
});

describe("해시 라우팅(사이드바 8항목)", () => {
  it("사이드바는 DESIGN 4.4 정본 8항목이고 각 항목이 라우트로 연결된다", async () => {
    render(<App core={noCore} />);
    await passOnboarding();
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    const links = Array.from(nav.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual(["대시보드", "로또 생성", "연금 생성", "통계", "내 번호", "회차", "알림", "설정"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#/", "#/lotto", "#/pension", "#/stats", "#/tickets", "#/draws", "#/alerts", "#/settings"]);
  });

  it("해시가 바뀌면 제목과 현재 항목이 바뀐다", async () => {
    render(<App core={noCore} />);
    await passOnboarding();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("대시보드");
    go("#/pension");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("연금복권 720+ 번호 생성");
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(nav.querySelector('[aria-current="page"]')).toHaveAttribute("href", "#/pension");
  });

  it("모르는 경로는 대시보드로 본다", async () => {
    go("#/nowhere");
    render(<App core={noCore} />);
    await passOnboarding();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("대시보드");
  });

  it("설정이 없으면 화면 대신 연결 설정 안내를 보인다", async () => {
    render(<App core={noCore} />);
    await passOnboarding();
    expect(screen.getByText("서버 연결 설정이 없습니다")).toBeInTheDocument();
  });
});
