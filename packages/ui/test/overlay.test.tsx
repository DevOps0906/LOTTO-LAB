import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionMenu, AlertDialog, Button, InfoTip, Sheet } from "../src";

function DialogHarness({ onConfirm = () => {} }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        프로필 삭제
      </Button>
      <AlertDialog
        open={open}
        title="사주 프로필 '홍길동'을 삭제할까요?"
        description="삭제하면 되돌릴 수 없습니다."
        confirmLabel="삭제"
        onConfirm={() => {
          onConfirm();
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

function SheetHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>생성 조건</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="생성 조건" footer={<Button>적용</Button>}>
        <label>
          게임 수 <input />
        </label>
      </Sheet>
    </>
  );
}

describe("AlertDialog", () => {
  it("role=alertdialog·대상·결과, 열리면 취소에 포커스, 배경 inert·스크롤 잠금", async () => {
    const user = userEvent.setup();
    const { container } = render(<DialogHarness />);
    await user.click(screen.getByRole("button", { name: "프로필 삭제" }));
    const dialog = screen.getByRole("alertdialog", { name: "사주 프로필 '홍길동'을 삭제할까요?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("삭제하면 되돌릴 수 없습니다.");
    expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "삭제" })).toHaveAttribute("data-variant", "danger");
    expect(container).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("포커스 트랩: Tab·Shift+Tab이 다이얼로그 안에서 돈다", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole("button", { name: "프로필 삭제" }));
    const cancel = screen.getByRole("button", { name: "취소" });
    const confirm = screen.getByRole("button", { name: "삭제" });
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });

  it("Esc = 취소, 닫히면 트리거로 포커스 복귀·inert 해제", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { container } = render(<DialogHarness onConfirm={onConfirm} />);
    const trigger = screen.getByRole("button", { name: "프로필 삭제" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    expect(container).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
  });

  it("실행 버튼은 onConfirm을 부른다", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DialogHarness onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "프로필 삭제" }));
    await user.click(screen.getByRole("button", { name: "삭제" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "프로필 삭제" })).toHaveFocus();
  });
});

describe("Sheet", () => {
  it("role=dialog, 닫기 버튼 필수, 열리면 패널 포커스, 트랩, Esc·닫기로 닫히고 트리거 복귀", async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    const trigger = screen.getByRole("button", { name: "생성 조건" });
    await user.click(trigger);
    const sheet = screen.getByRole("dialog", { name: "생성 조건" });
    expect(sheet).toHaveClass("ll-sheet");
    expect(sheet).toHaveFocus();
    const close = screen.getByRole("button", { name: "닫기" });
    const apply = screen.getByRole("button", { name: "적용" });
    await user.tab({ shift: true });
    expect(apply).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("배경(scrim)을 누르면 닫힌다", async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    await user.click(screen.getByRole("button", { name: "생성 조건" }));
    fireEvent.click(document.querySelector(".ll-layer__scrim") as Element);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("포커스 트랩 대상", () => {
  it("숨김(display:none·hidden·aria-hidden)·tabindex=-1 버튼은 트랩 순환에서 빠진다", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>열기</Button>
          <Sheet
            open={open}
            onClose={() => setOpen(false)}
            title="옵션"
            footer={
              <>
                <Button>적용</Button>
                <Button tabIndex={-1}>음수</Button>
                <span aria-hidden="true">
                  <Button>가림</Button>
                </span>
                <span hidden>
                  <Button>숨김</Button>
                </span>
                <Button style={{ display: "none" }}>안보임</Button>
              </>
            }
          >
            <p>내용</p>
          </Sheet>
        </>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "열기" }));
    const apply = screen.getByRole("button", { name: "적용" });
    await user.tab({ shift: true });
    expect(apply).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();
  });
});

describe("ActionMenu", () => {
  const setupMenu = () => {
    const onCopy = vi.fn();
    const onRemove = vi.fn();
    render(
      <ActionMenu
        label="1번 줄 메뉴"
        items={[
          { id: "copy", label: "복사", onSelect: onCopy },
          { id: "hold", label: "보관", onSelect: () => {}, disabled: true },
          { id: "remove", label: "내 번호에서 제거", onSelect: onRemove, tone: "danger" },
        ]}
      />,
    );
    return { onCopy, onRemove, trigger: screen.getByRole("button", { name: "1번 줄 메뉴" }) };
  };

  it("열면 첫 항목 포커스, 화살표는 비활성 항목을 건너뛰며 순환, Esc는 닫고 트리거로", async () => {
    const user = userEvent.setup();
    const { trigger } = setupMenu();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: "1번 줄 메뉴" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "복사" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "내 번호에서 제거" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "복사" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "내 번호에서 제거" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("트리거에서 ↑는 마지막 항목으로 열고, 항목 선택은 콜백 후 닫는다", async () => {
    const user = userEvent.setup();
    const { trigger, onRemove } = setupMenu();
    trigger.focus();
    await user.keyboard("{ArrowUp}");
    const remove = screen.getByRole("menuitem", { name: "내 번호에서 제거" });
    expect(remove).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("Tab·Shift+Tab은 메뉴를 닫고 메뉴 버튼의 다음·이전 요소로 간다", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">앞</button>
        <ActionMenu label="번호 줄 메뉴" items={[{ id: "copy", label: "복사", onSelect: () => {} }]} />
        <button type="button">뒤</button>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "번호 줄 메뉴" });
    await user.click(trigger);
    expect(screen.getByRole("menuitem", { name: "복사" })).toHaveFocus();
    await user.tab();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "뒤" })).toHaveFocus();
    await user.click(trigger);
    await user.tab({ shift: true });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "앞" })).toHaveFocus();
  });

  it("바깥을 누르면 닫힌다", async () => {
    const user = userEvent.setup();
    const { trigger } = setupMenu();
    await user.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("InfoTip", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("마우스·키보드: 포커스·호버로 role=tooltip이 보이고 Esc·이탈로 닫힌다", async () => {
    const user = userEvent.setup();
    render(<InfoTip label="표본">최근 N회차 당첨 번호 묶음</InfoTip>);
    const button = screen.getByRole("button", { name: "표본 설명" });
    expect(button).toHaveAccessibleDescription("최근 N회차 당첨 번호 묶음");
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.tab();
    expect(screen.getByRole("tooltip")).toHaveTextContent("최근 N회차 당첨 번호 묶음");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.tab();
    await user.hover(button);
    expect(screen.getByRole("tooltip")).toBeVisible();
    await user.unhover(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("툴팁 위로 포인터를 옮겨도 유지되고, 호버 중 Esc로 닫힌다(WCAG 1.4.13)", async () => {
    const user = userEvent.setup();
    render(<InfoTip label="기간">집계에 쓴 회차 범위</InfoTip>);
    const button = screen.getByRole("button", { name: "기간 설명" });
    await user.hover(button);
    const tip = screen.getByRole("tooltip");
    expect(tip.parentElement).toBe(button.parentElement);
    await user.hover(tip);
    expect(screen.getByRole("tooltip")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(button).not.toHaveFocus();
  });

  it("터치(coarse pointer): 탭하는 정보 버튼(aria-expanded 토글)", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const user = userEvent.setup();
    render(<InfoTip label="기준선">무작위로 뽑았을 때의 기대값</InfoTip>);
    const button = screen.getByRole("button", { name: "기준선 설명" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("무작위로 뽑았을 때의 기대값")).toBeVisible();
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
