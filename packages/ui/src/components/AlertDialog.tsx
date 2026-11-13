import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { useModalLayer } from "./modal-layer";

export type AlertDialogProps = {
  open: boolean;
  /** 대상(예: "사주 프로필 '홍길동'을 삭제할까요?") */
  title: ReactNode;
  /** 결과(예: "삭제하면 되돌릴 수 없습니다.") */
  description: ReactNode;
  /** 실행 버튼 — 트리거와 같은 동사(예: "삭제") */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** 취소 버튼·Esc */
  onCancel: () => void;
};

/**
 * 얼럿 다이얼로그(DESIGN.md 4.7) — 되돌릴 수 없는 행동 확인용. 되돌릴 수 있는 제거는 스낵바(실행 취소)를 쓴다.
 * role=alertdialog, 열리면 취소에 포커스, 포커스 트랩, Esc = 취소, 배경 클릭은 무시, 닫히면 트리거로 복귀.
 */
export function AlertDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "취소",
  onConfirm,
  onCancel,
}: AlertDialogProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();
  const onKeyDown = useModalLayer(open, rootRef, panelRef, onCancel, cancelRef);
  if (!open) return null;
  return createPortal(
    <div ref={rootRef} className="ll-layer" data-kind="alert">
      <div className="ll-layer__scrim" aria-hidden="true" />
      <div
        ref={panelRef}
        className="ll-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="ll-dialog__title">
          {title}
        </h2>
        <p id={descId} className="ll-dialog__desc">
          {description}
        </p>
        <div className="ll-dialog__actions">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
