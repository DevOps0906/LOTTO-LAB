import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Icon } from "./icons";
import { getTabbable } from "./modal-layer";

export type ActionMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  /** 삭제·제거 등 */
  tone?: "danger";
  disabled?: boolean;
};

export type ActionMenuProps = {
  /** 트리거 이름(예: "1번 줄 메뉴") */
  label: string;
  items: ActionMenuItem[];
  /** 메뉴 제목(~767 액션시트 상단에 보임). 없으면 label */
  title?: string;
  /** 트리거 내용. 기본 ⋯ 아이콘 */
  trigger?: ReactNode;
  /** ~767 액션시트의 닫기 버튼 */
  cancelLabel?: string;
};

type OpenState = false | "first" | "last";

function enabledItems(menu: HTMLElement | null) {
  return Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
}

/**
 * 항목 작업 메뉴(DESIGN.md 4.7). 같은 마크업·같은 항목·같은 결과를 CSS가 바꾼다: ~767 액션시트(하단 + 취소) / 768~ 앵커 드롭다운.
 * WAI-ARIA 메뉴 버튼: ↓·Enter·Space로 열고 첫 항목 포커스(↑는 마지막), ↑↓·Home·End 이동, Esc는 닫고 트리거로,
 * Tab·Shift+Tab은 닫고 메뉴 버튼의 다음·이전 요소로, 바깥 누름은 닫기.
 * 비모달이라 배경 inert·스크롤 잠금은 하지 않는다.
 */
export function ActionMenu({ label, items, title, trigger, cancelLabel = "취소" }: ActionMenuProps) {
  const [open, setOpen] = useState<OpenState>(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const els = enabledItems(menuRef.current);
    (open === "last" ? els[els.length - 1] : els[0])?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(event.key === "ArrowUp" ? "last" : "first");
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const els = enabledItems(menuRef.current);
    const count = els.length;
    const index = els.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    switch (event.key) {
      case "ArrowDown":
        next = els[(index + 1) % count];
        break;
      case "ArrowUp":
        next = els[(index - 1 + count) % count];
        break;
      case "Home":
        next = els[0];
        break;
      case "End":
        next = els[count - 1];
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case "Tab": {
        // 메뉴를 동기로 닫고(flushSync) 메뉴 버튼 기준 문서의 다음/이전 Tab 대상으로 직접 옮긴다.
        // 기본 Tab에 맡기면 브라우저마다 출발점(사라진 항목)이 달라 결과가 어긋난다.
        event.preventDefault();
        flushSync(() => setOpen(false));
        const trigger = triggerRef.current;
        if (!trigger) return;
        const order = getTabbable(document);
        const target = order[order.indexOf(trigger) + (event.shiftKey ? -1 : 1)];
        (target ?? trigger).focus();
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    next?.focus();
  };

  return (
    <div ref={wrapRef} className="ll-menu">
      <button
        ref={triggerRef}
        type="button"
        className="ll-icon-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open !== false}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(open ? false : "first")}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger ?? <Icon name="more" />}
      </button>
      {open && (
        <>
          <div className="ll-menu__scrim" aria-hidden="true" onClick={close} />
          <div className="ll-menu__panel">
            <p className="ll-menu__title" aria-hidden="true">
              {title ?? label}
            </p>
            <ul ref={menuRef} id={menuId} role="menu" aria-label={title ?? label} onKeyDown={onMenuKeyDown}>
              {items.map((item) => (
                <li key={item.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    disabled={item.disabled}
                    data-tone={item.tone}
                    onClick={() => {
                      close();
                      item.onSelect();
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="ll-menu__cancel" onClick={close}>
              {cancelLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
