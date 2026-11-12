import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CLEAR_PHRASE, Settings } from "../src";
import { fakeSettingsCore, renderWithNotice } from "./ticket-core";

function setup(summary?: Parameters<typeof fakeSettingsCore>[0]) {
  const f = fakeSettingsCore(summary);
  const onThemeChange = vi.fn();
  const onCleared = vi.fn();
  renderWithNotice(<Settings core={f.core} appVersion="0.1.0" onThemeChange={onThemeChange} onCleared={onCleared} />);
  return { ...f, onThemeChange, onCleared };
}

describe("M-12 설정", () => {
  it("로딩 → 성공: 테마·19세 확인 시각·권한·데이터 개수·앱 버전·준비 중 항목, 광고 동의는 보이지 않는다", async () => {
    const f = setup();
    expect(screen.getByText("설정을 불러오는 중입니다")).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: "시스템 설정" })).toBeChecked();
    expect(screen.getByText(/확인함/)).toBeInTheDocument();
    expect(screen.getByText(/즐겨찾기 1개 · 구매 기록 1개 · 생성 이력 3개/)).toBeInTheDocument();
    expect(screen.getByText("0.1.0")).toBeInTheDocument();
    expect(screen.getByText("이용약관").nextSibling).toHaveTextContent("준비 중");
    expect(screen.getByText("개인정보 처리방침").nextSibling).toHaveTextContent("준비 중");
    expect(screen.getByText("오픈소스 라이선스").nextSibling).toHaveTextContent("준비 중");
    expect(screen.queryByText(/광고/)).toBeNull();
    expect(f.core.ageGate.confirmedAt).toHaveBeenCalled();
  });

  it("오류 상태 + 다시 시도", async () => {
    const f = fakeSettingsCore();
    vi.mocked(f.core.data.summary).mockRejectedValueOnce(new Error("io"));
    renderWithNotice(<Settings core={f.core} appVersion="0.1.0" onThemeChange={vi.fn()} onCleared={vi.fn()} />);
    expect(await screen.findByText("설정을 불러오지 못했습니다")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("radio", { name: "다크" })).toBeInTheDocument();
  });

  it("테마 다크 선택 → 셸에 즉시 적용 + 저장", async () => {
    const f = setup();
    expect(await screen.findByRole("radiogroup", { name: "테마" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "다크" }));
    expect(screen.getByRole("radio", { name: "다크" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "시스템 설정" })).not.toBeChecked();
    expect(f.onThemeChange).toHaveBeenCalledWith("dark");
    expect(f.setTheme).toHaveBeenCalledWith("dark");
  });

  it("내보내기: JSON 복사(000719 문자열 보존)·공유, 기록이 없으면 비활성(빈 상태)", async () => {
    const f = setup();
    await userEvent.click(await screen.findByRole("button", { name: "내보내기(JSON 복사)" }));
    await waitFor(() => expect(f.writeText).toHaveBeenCalled());
    expect(f.writeText.mock.calls[0]![0]).toContain('"digits": "000719"');
    expect(await screen.findByText("복사했어요")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "내보내기(공유)" }));
    await waitFor(() => expect(f.share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("000719") })));
  });

  it("빈 데이터: 내보내기 비활성 + 안내", async () => {
    setup({ tickets: 0, favorites: 0, purchased: 0, generated: 0 });
    expect(await screen.findByText("내보낼 기록이 아직 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "내보내기(JSON 복사)" })).toBeDisabled();
  });

  it("모두 삭제: 문구 재입력 전 비활성 → AlertDialog 취소는 아무것도 안 함 → 삭제 확인 시 clearAll + onCleared", async () => {
    const f = setup();
    const button = await screen.findByRole("button", { name: "모든 데이터 삭제" });
    expect(button).toBeDisabled();
    const input = screen.getByRole("textbox", { name: `확인을 위해 ‘${CLEAR_PHRASE}’를 입력하세요` });
    await userEvent.type(input, "모두");
    expect(button).toBeDisabled();
    await userEvent.type(input, " 삭제");
    expect(button).toBeEnabled();
    await userEvent.click(button);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("되돌릴 수 없습니다");
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(f.clearAll).not.toHaveBeenCalled();
    await userEvent.click(button);
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(f.onCleared).toHaveBeenCalledTimes(1));
    expect(f.clearAll).toHaveBeenCalledTimes(1);
  });

  it("모두 삭제 실패는 화면에 남기고 onCleared를 부르지 않는다", async () => {
    const f = setup();
    f.clearAll.mockRejectedValueOnce(new Error("io"));
    await userEvent.type(await screen.findByRole("textbox", { name: /확인을 위해/ }), CLEAR_PHRASE);
    await userEvent.click(screen.getByRole("button", { name: "모든 데이터 삭제" }));
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(await screen.findByText("일부 데이터를 지우지 못했어요. 다시 시도하세요.")).toBeInTheDocument();
    expect(f.onCleared).not.toHaveBeenCalled();
  });
});
