import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { Icon } from "./icons";

const COARSE = "(pointer: coarse)";

function subscribe(onChange: () => void) {
  const query = typeof window.matchMedia === "function" ? window.matchMedia(COARSE) : null;
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}
function isCoarse() {
  return typeof window.matchMedia === "function" && window.matchMedia(COARSE).matches;
}

export type InfoTipProps = {
  /** 설명할 용어(버튼 이름은 "<label> 설명") */
  label: string;
  /** 짧은 설명 한두 문장 */
  children: ReactNode;
};

/**
 * 용어 설명(DESIGN.md 4.7). 입력 방식으로 바꾼다:
 * 마우스·키보드(fine pointer) = 툴팁(호버·포커스로 열림, aria-describedby, Esc로 닫힘, 래퍼가 툴팁을 품고 CSS 다리로 빈틈을 메워
 * 툴팁 위로 옮겨도 유지) /
 * 터치(coarse pointer) = 탭하는 정보 버튼(aria-expanded 토글, 다시 탭·Esc·포커스 이탈로 닫힘).
 */
export function InfoTip({ label, children }: InfoTipProps) {
  const coarse = useSyncExternalStore(subscribe, isCoarse, () => false);
  const [open, setOpen] = useState(false);
  const tipId = useId();

  // 열려 있는 동안 Esc는 포인터·포커스 위치와 무관하게 닫는다(WCAG 1.4.13 dismissible)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <span
      className="ll-infotip"
      data-mode={coarse ? "toggle" : "tooltip"}
      onMouseEnter={coarse ? undefined : () => setOpen(true)}
      onMouseLeave={coarse ? undefined : () => setOpen(false)}
    >
      <button
        type="button"
        className="ll-icon-button ll-infotip__button"
        aria-label={`${label} 설명`}
        aria-describedby={coarse ? undefined : tipId}
        aria-expanded={coarse ? open : undefined}
        aria-controls={coarse ? tipId : undefined}
        onClick={coarse ? () => setOpen((value) => !value) : undefined}
        onFocus={coarse ? undefined : () => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Icon name="info" />
      </button>
      <span id={tipId} role={coarse ? undefined : "tooltip"} className="ll-infotip__tip" hidden={!open}>
        {children}
      </span>
    </span>
  );
}
