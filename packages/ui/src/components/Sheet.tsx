import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { useModalLayer } from "./modal-layer";

export type SheetProps = {
  open: boolean;
  /** 닫기 버튼·배경·Esc. 닫기만 하면 기존 값 유지 — 값 반영은 footer의 적용 버튼에서만(소비 측 규약) */
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** 하단 고정 영역(예: 적용 버튼) */
  footer?: ReactNode;
  closeLabel?: string;
};

/**
 * 반응형 시트(DESIGN.md 4.7). 같은 마크업을 CSS가 바꾼다: ~767 바텀시트(safe-area·내부 스크롤) / 768~ 가운데 모달.
 * role=dialog·aria-modal, 열리면 패널로 포커스, 포커스 트랩, Esc·배경·닫기 버튼 = onClose, 닫히면 트리거로 복귀.
 */
export function Sheet({ open, onClose, title, children, footer, closeLabel = "닫기" }: SheetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onKeyDown = useModalLayer(open, rootRef, panelRef, onClose);
  if (!open) return null;
  return createPortal(
    <div ref={rootRef} className="ll-layer" data-kind="sheet">
      <div className="ll-layer__scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className="ll-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="ll-sheet__head">
          <h2 id={titleId} className="ll-sheet__title">
            {title}
          </h2>
          <button type="button" className="ll-icon-button" aria-label={closeLabel} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="ll-sheet__body">{children}</div>
        {footer && <div className="ll-sheet__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
