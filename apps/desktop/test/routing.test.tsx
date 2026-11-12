import { render, screen } from "@testing-library/react";
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

afterEach(() => {
  window.location.hash = "";
});

describe("해시 라우팅(사이드바 8항목)", () => {
  it("사이드바는 DESIGN 4.4 정본 8항목이다", () => {
    render(<App core={noCore} />);
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    const labels = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("aria-label"));
    expect(labels).toEqual(["대시보드", "로또 생성", "연금 생성", "통계", "내 번호", "회차", "알림", "설정"]);
  });

  it("해시가 바뀌면 제목과 현재 항목이 바뀐다", () => {
    render(<App core={noCore} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("대시보드");
    go("#/pension");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("연금복권 720+ 번호 생성");
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(nav.querySelector('[aria-current="page"]')).toHaveAttribute("href", "#/pension");
  });

  it("모르는 경로는 대시보드로 본다", () => {
    go("#/nowhere");
    render(<App core={noCore} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("대시보드");
  });
});
