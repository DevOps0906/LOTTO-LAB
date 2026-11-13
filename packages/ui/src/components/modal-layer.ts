import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** container 안에서 실제로 Tab이 닿는 요소만(hidden·inert·aria-hidden 조상, display:none·visibility:hidden, tabindex<0 제외) */
export function getTabbable(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.tabIndex < 0 || el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    if (getComputedStyle(el).visibility === "hidden") return false;
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      if (getComputedStyle(node).display === "none") return false;
    }
    return true;
  });
}

// 열린 모달 수(알림은 모달이 열린 동안 포커스 가능한 스낵바를 보류한다)
let modalCount = 0;
const modalListeners = new Set<() => void>();
function setModalCount(next: number) {
  modalCount = next;
  for (const listener of modalListeners) listener();
}
export function subscribeModal(listener: () => void) {
  modalListeners.add(listener);
  return () => {
    modalListeners.delete(listener);
  };
}
export function isModalOpen() {
  return modalCount > 0;
}

/**
 * 모달형 오버레이(Sheet·AlertDialog) 공통 동작. 열린 오버레이 1개 기준(모달 여러 겹 금지, DESIGN.md 4.7):
 * 열릴 때 트리거 기억 → 배경(body 직속 형제) inert·스크롤 잠금 → 첫 포커스 이동.
 * 닫히면 inert·스크롤 복원 후 트리거로 포커스 복귀. 알림 영역(data-ll-live)은 inert에서 뺀다(낭독 유지).
 * 반환값은 패널 onKeyDown: Esc = onEscape, Tab·Shift+Tab은 패널 안에서 순환.
 */
export function useModalLayer(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  onEscape: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  });

  useEffect(() => {
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!open || !root || !panel) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inerted: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === root || el.hasAttribute("inert") || el.hasAttribute("data-ll-live")) continue;
      el.setAttribute("inert", "");
      inerted.push(el);
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (initialFocusRef?.current ?? panel).focus();
    setModalCount(modalCount + 1);
    return () => {
      setModalCount(modalCount - 1);
      for (const el of inerted) el.removeAttribute("inert");
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open, rootRef, panelRef, initialFocusRef]);

  return function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      escapeRef.current();
      return;
    }
    const panel = panelRef.current;
    if (event.key !== "Tab" || !panel) return;
    const items = getTabbable(panel);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };
}
