"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

type Platform = "Android" | "Windows";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// 배포 전에는 실제 링크가 없으므로 "준비 중" 모달만 연다.
// 모달은 body 직속으로 띄우고, 열린 동안 나머지 body 자식은 inert(포커스·스크린리더 차단)로 둔다.
export function InstallButtons() {
  const [open, setOpen] = useState<Platform | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const portal = dialogRef.current?.parentElement;
    const others = Array.from(document.body.children).filter((el) => el !== portal && !el.hasAttribute("inert"));
    others.forEach((el) => el.setAttribute("inert", ""));
    closeRef.current?.focus();
    return () => {
      others.forEach((el) => el.removeAttribute("inert"));
      openerRef.current?.focus();
    };
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(null);
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const button = (p: Platform) => (
    <button
      type="button"
      onClick={(e) => {
        openerRef.current = e.currentTarget;
        setOpen(p);
      }}
      className="h-control rounded-control border border-navy-fg/40 px-5 font-bold text-navy-fg hover:bg-navy-fg/10"
    >
      {p} 설치 안내
    </button>
  );

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {button("Android")}
        {button("Windows")}
      </div>
      {open &&
        createPortal(
          <div className="backdrop fixed inset-0 z-50 flex items-center justify-center p-page" onClick={() => setOpen(null)}>
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="install-title"
              onKeyDown={onKeyDown}
              className="w-full max-w-md rounded-card bg-surface p-6 text-text shadow-raised"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="install-title" className="text-h2 font-bold">
                {open} 앱은 준비 중이에요
              </h2>
              <p className="mt-2 text-text-muted">
                아직 배포 전이라 설치 링크가 없어요. 아래에서 사전알림을 신청하면 출시 때 한 번 알려 드려요.
              </p>
              <div className="mt-5 flex flex-col gap-2 md:flex-row-reverse">
                <a
                  href="#waitlist"
                  onClick={() => {
                    openerRef.current = null;
                    setOpen(null);
                  }}
                  className="cta-primary flex h-control flex-1 items-center justify-center rounded-control font-bold"
                >
                  사전알림 신청하기
                </a>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(null)}
                  className="h-control flex-1 rounded-control border border-input font-bold text-text"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
