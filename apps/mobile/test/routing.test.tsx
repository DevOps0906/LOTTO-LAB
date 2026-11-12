import { render, screen } from "@testing-library/react";
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

afterEach(() => {
  window.location.hash = "";
});

describe("해시 라우팅", () => {
  it("하단 탭은 홈·추천·통계·내번호 4개다", () => {
    render(<App core={noCore} />);
    const tabbar = screen.getByRole("navigation", { name: "하단 탭" });
    const labels = Array.from(tabbar.querySelectorAll("a")).map((a) => a.textContent);
    expect(labels).toEqual(["홈", "추천", "통계", "내번호"]);
  });

  it("해시가 바뀌면 화면 제목과 현재 탭이 바뀐다", () => {
    render(<App core={noCore} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("홈");
    go("#/stats");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("통계");
    const tabbar = screen.getByRole("navigation", { name: "하단 탭" });
    expect(tabbar.querySelector('[aria-current="page"]')).toHaveAttribute("href", "#/stats");
  });

  it("모르는 경로는 홈으로 본다", () => {
    go("#/nowhere");
    render(<App core={noCore} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("홈");
    expect(readHashPath("")).toBe("/");
    expect(readHashPath("#tickets")).toBe("/");
  });

  it("설정이 없으면 안내를 보인다", () => {
    render(<App core={noCore} />);
    expect(screen.getByText("서버 연결 설정이 없습니다")).toBeInTheDocument();
  });
});
