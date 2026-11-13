import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoticeProvider, Sheet, SNACKBAR_ACTION_MS, SNACKBAR_MS, TOAST_MS, useNotice, type NoticeApi } from "../src";

let api: NoticeApi;
function Capture() {
  api = useNotice();
  return null;
}
function setup(offset?: string) {
  render(
    <NoticeProvider offset={offset}>
      <Capture />
    </NoticeProvider>,
  );
}
const status = () => screen.getByRole("status");
const alertRegion = () => screen.getByRole("alert");
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const call = (fn: () => void) => act(fn);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("NoticeProvider · useNotice", () => {
  it("알림 영역은 처음부터 있고 role=status·aria-live=polite, 오류용 role=alert가 따로 있다", () => {
    setup();
    expect(status()).toHaveAttribute("aria-live", "polite");
    expect(status()).toBeEmptyDOMElement();
    expect(alertRegion()).toBeEmptyDOMElement();
    expect(status().closest(".ll-notice-region")).toHaveAttribute("data-ll-live");
  });

  it("토스트는 3초 뒤 사라진다", () => {
    setup();
    call(() => api.toast("복사했어요"));
    expect(status()).toHaveTextContent("복사했어요");
    expect(status().querySelector("button")).toBeNull();
    advance(TOAST_MS - 1);
    expect(status()).toHaveTextContent("복사했어요");
    advance(1);
    expect(status()).toBeEmptyDOMElement();
  });

  it("액션 없는 스낵바 6초, 액션 있는 스낵바 기본 10초·더 짧게 줄일 수 없다", () => {
    setup();
    call(() => api.snackbar({ message: "설정을 바꿨어요" }));
    advance(SNACKBAR_MS);
    expect(status()).toBeEmptyDOMElement();
    call(() => api.snackbar({ message: "저장했어요", action: { label: "실행 취소", onAction: () => {} }, duration: 2000 }));
    advance(SNACKBAR_ACTION_MS - 1);
    expect(status()).toHaveTextContent("저장했어요");
    advance(1);
    expect(status()).toBeEmptyDOMElement();
  });

  it("스낵바는 닫기 버튼(알림 닫기)과, 포커스가 안에 있을 때 Esc로 닫힌다", () => {
    setup();
    call(() => api.snackbar({ message: "저장했어요", action: { label: "실행 취소", onAction: () => {} } }));
    fireEvent.click(within(status()).getByRole("button", { name: "알림 닫기" }));
    expect(status()).toBeEmptyDOMElement();
    call(() => api.snackbar({ message: "제거했어요", action: { label: "실행 취소", onAction: () => {} } }));
    const undo = screen.getByRole("button", { name: "실행 취소" });
    act(() => undo.focus());
    fireEvent.keyDown(undo, { key: "Escape" });
    expect(status()).toBeEmptyDOMElement();
  });

  it("모달이 열린 동안 스낵바는 보류(포커스 가능한 요소 없음), 토스트는 보이고, 닫힌 뒤 스낵바를 처음부터 보인다", () => {
    let setOpen: (open: boolean) => void = () => {};
    function ModalHarness() {
      const [open, set] = useState(false);
      setOpen = set;
      return (
        <Sheet open={open} onClose={() => set(false)} title="생성 조건">
          <p>조건</p>
        </Sheet>
      );
    }
    render(
      <NoticeProvider>
        <Capture />
        <ModalHarness />
      </NoticeProvider>,
    );
    call(() => api.snackbar({ message: "저장했어요", action: { label: "실행 취소", onAction: () => {} } }));
    advance(3000);
    act(() => setOpen(true));
    const region = status().closest(".ll-notice-region") as HTMLElement;
    expect(region).not.toHaveAttribute("inert");
    expect(status()).toBeEmptyDOMElement();
    call(() => api.toast("복사했어요"));
    expect(status()).toHaveTextContent("복사했어요");
    expect(region.querySelector("button")).toBeNull();
    advance(TOAST_MS);
    expect(status()).toBeEmptyDOMElement();
    advance(60_000);
    act(() => setOpen(false));
    expect(status()).toHaveTextContent("저장했어요");
    advance(SNACKBAR_ACTION_MS - 1);
    expect(status()).toHaveTextContent("저장했어요");
    advance(1);
    expect(status()).toBeEmptyDOMElement();
  });

  it("실행 취소를 누르면 콜백이 한 번 불리고 알림이 닫힌다", () => {
    setup();
    const onAction = vi.fn();
    call(() => api.snackbar({ message: "내 번호에서 제거했어요", action: { label: "실행 취소", onAction } }));
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(status()).toBeEmptyDOMElement();
  });

  it("한 번에 1개, 들어온 순서대로(FIFO) 보인다", () => {
    setup();
    call(() => {
      api.snackbar({ message: "첫째" });
      api.snackbar({ message: "둘째" });
      api.toast("셋째");
    });
    expect(screen.getAllByText(/째/)).toHaveLength(1);
    expect(status()).toHaveTextContent("첫째");
    advance(SNACKBAR_MS);
    expect(status()).toHaveTextContent("둘째");
    advance(SNACKBAR_MS);
    expect(status()).toHaveTextContent("셋째");
    advance(TOAST_MS);
    expect(status()).toBeEmptyDOMElement();
  });

  it("새 스낵바는 표시 중인 토스트를 즉시 교체한다", () => {
    setup();
    call(() => api.toast("복사했어요"));
    call(() => api.snackbar({ message: "저장했어요", action: { label: "실행 취소", onAction: () => {} } }));
    expect(status()).toHaveTextContent("저장했어요");
    expect(status()).not.toHaveTextContent("복사했어요");
    advance(SNACKBAR_ACTION_MS);
    expect(status()).toBeEmptyDOMElement();
  });

  it("같은 key는 새로 쌓지 않고 합친다(표시 중이면 내용 교체·시간 다시 시작)", () => {
    setup();
    call(() => api.toast("복사했어요", { key: "copy" }));
    advance(TOAST_MS - 1000);
    call(() => api.toast("다시 복사했어요", { key: "copy" }));
    expect(status()).toHaveTextContent("다시 복사했어요");
    advance(TOAST_MS - 1);
    expect(status()).toHaveTextContent("다시 복사했어요");
    advance(1);
    expect(status()).toBeEmptyDOMElement();
  });

  it("대기 중 같은 key도 그 자리에서 합친다", () => {
    setup();
    call(() => {
      api.snackbar({ message: "A" });
      api.snackbar({ message: "B1", key: "b" });
      api.snackbar({ message: "C" });
      api.snackbar({ message: "B2", key: "b" });
    });
    advance(SNACKBAR_MS);
    expect(status()).toHaveTextContent("B2");
    advance(SNACKBAR_MS);
    expect(status()).toHaveTextContent("C");
    advance(SNACKBAR_MS);
    expect(status()).toBeEmptyDOMElement();
  });

  it("호버 중에는 멈추고, 벗어나면 남은 시간부터 이어 간다", () => {
    setup();
    call(() => api.snackbar({ message: "저장했어요", action: { label: "실행 취소", onAction: () => {} } }));
    advance(4000);
    const region = status().closest(".ll-notice-region") as HTMLElement;
    fireEvent.mouseEnter(region);
    advance(60_000);
    expect(status()).toHaveTextContent("저장했어요");
    fireEvent.mouseLeave(region);
    advance(SNACKBAR_ACTION_MS - 4001);
    expect(status()).toHaveTextContent("저장했어요");
    advance(1);
    expect(status()).toBeEmptyDOMElement();
  });

  it("키보드 포커스가 안에 있으면 멈추고, 포커스를 가로채지 않는다", () => {
    setup();
    const before = document.activeElement;
    call(() => api.snackbar({ message: "저장하지 못했어요", action: { label: "다시 시도", onAction: () => {} } }));
    expect(document.activeElement).toBe(before);
    const action = screen.getByRole("button", { name: "다시 시도" });
    act(() => action.focus());
    advance(60_000);
    expect(status()).toHaveTextContent("저장하지 못했어요");
    act(() => action.blur());
    advance(SNACKBAR_ACTION_MS);
    expect(status()).toBeEmptyDOMElement();
  });

  it("창이 비활성이면 멈춘다", () => {
    setup();
    call(() => api.toast("복사했어요"));
    fireEvent.blur(window);
    advance(60_000);
    expect(status()).toHaveTextContent("복사했어요");
    fireEvent.focus(window);
    advance(TOAST_MS);
    expect(status()).toBeEmptyDOMElement();
  });

  it("오류 tone은 role=alert 영역에 보이고, dismiss()로 바로 닫힌다", () => {
    setup();
    call(() =>
      api.snackbar({
        message: "네트워크 연결이 끊겼어요. 연결 후 다시 시도하세요.",
        tone: "error",
        action: { label: "다시 시도", onAction: () => {} },
      }),
    );
    expect(alertRegion()).toHaveTextContent("네트워크 연결이 끊겼어요");
    expect(status()).toBeEmptyDOMElement();
    call(() => api.dismiss());
    expect(alertRegion()).toBeEmptyDOMElement();
  });

  it("offset을 CSS 변수로 넘긴다", () => {
    setup("var(--spacing-control)");
    const region = status().closest(".ll-notice-region") as HTMLElement;
    expect(region.style.getPropertyValue("--ll-notice-offset")).toBe("var(--spacing-control)");
  });

  it("Provider 밖에서 useNotice는 오류를 던진다", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Capture />)).toThrow(/NoticeProvider/);
  });
});
