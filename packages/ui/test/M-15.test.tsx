import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GenerateSelect } from "../src";
import { FETCHED, mockCore } from "./screen-core";

const links = { home: "#/", lotto: "#/generate/lotto", pension: "#/generate/pension" };

describe("M-15 추천 복권 선택", () => {
  it("로또·연금 생성기로 이동, 운세·테마(P1) 버튼 없음", async () => {
    const m = mockCore();
    render(<GenerateSelect core={m.core} links={links} />);
    expect(screen.getByRole("link", { name: "로또 번호 생성" })).toHaveAttribute("href", "#/generate/lotto");
    expect(screen.getByRole("link", { name: "연금복권 번호 생성" })).toHaveAttribute("href", "#/generate/pension");
    expect(screen.queryByText(/운세|테마/)).not.toBeInTheDocument();
    expect(screen.getByText(/오프라인에서도 생성할 수 있습니다/)).toBeInTheDocument();
    expect(await screen.findByText("이전 생성 기록이 없습니다")).toBeInTheDocument();
  });

  it("로딩: 생성 기록 읽기 표시", () => {
    const m = mockCore();
    m.history.mockReturnValue(new Promise(() => {}));
    render(<GenerateSelect core={m.core} links={links} />);
    expect(screen.getByRole("status")).toHaveTextContent("이 기기의 생성 기록을 읽는 중입니다");
  });

  it("오류: 기록을 읽지 못하면 기본값으로 시작 안내", async () => {
    const m = mockCore();
    m.history.mockRejectedValue(new Error("STORAGE_FAILED"));
    render(<GenerateSelect core={m.core} links={links} />);
    expect(await screen.findByText("최근 생성 기록을 읽지 못했습니다")).toBeInTheDocument();
    expect(screen.getByText(/기본값으로 시작합니다/)).toBeInTheDocument();
  });

  it("성공: 같은 복권으로 다시 만들기는 최근 생성한 복권의 생성기로", async () => {
    const m = mockCore();
    m.history.mockResolvedValue([{ game: "pension", created_at: FETCHED, numbers: { digits: "000719" } }]);
    render(<GenerateSelect core={m.core} links={links} />);
    expect(await screen.findByRole("link", { name: "같은 복권으로 다시 만들기" })).toHaveAttribute("href", "#/generate/pension");
  });
});

describe("화면 문구(PRD 6장 금지 문구)", () => {
  const BANNED = ["과학적으로 추천", "당첨 보장", "확률 상승", "당첨 확률이 높은", "고확률", "맞춤 당첨", "대박 번호", "행운이 보장", "오늘 당첨될"];
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }
  it("screens 소스(M-05·M-01·M-15)에 금지 문구가 없다", () => {
    const hits = files(join(import.meta.dirname, "../src/screens")).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return BANNED.filter((w) => text.includes(w)).map((w) => `${file}: ${w}`);
    });
    expect(hits).toEqual([]);
  });
});
