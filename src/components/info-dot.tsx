"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY, type Term } from "@/lib/glossary";

// A small (i) that explains one of the app's terms. Hover to open on a desktop,
// tap to open on a phone. The plain description shows first; the technical
// "How it works" is a collapsed accordion, so only people who want it see it.
// The popover renders to <body> in a fixed position, so no card can clip it.

export function InfoDot({ term, className = "" }: { term: Term; className?: string }) {
  const entry = GLOSSARY[term];
  const id = useId().replace(/[^a-z0-9]/gi, "");
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const width = 288; // w-72
    const margin = 8;
    const left = Math.min(Math.max(margin, b.left + b.width / 2 - width / 2), window.innerWidth - width - margin);
    setCoords({ top: b.bottom + 6, left });
  };

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    place();
    setOpen(true);
  };
  const scheduleClose = () => {
    if (pinned) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };
  const hardClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(false);
    setPinned(false);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) hardClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (hardClose(), btnRef.current?.focus());
    const onScroll = () => hardClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", hardClose);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", hardClose);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`About ${entry.label}`}
        aria-expanded={open}
        aria-describedby={open ? `info-${id}` : undefined}
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onFocus={show}
        onBlur={scheduleClose}
        onClick={() => {
          if (open && pinned) hardClose();
          else {
            setPinned(true);
            show();
          }
        }}
        className={`inline-flex h-4 w-4 shrink-0 select-none items-center justify-center rounded-full border border-muted/50 align-[0.05em] text-[10px] font-semibold leading-none text-muted outline-none transition hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent ${className}`}
      >
        i
      </button>

      {open && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            id={`info-${id}`}
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={scheduleClose}
            style={{ position: "fixed", top: coords.top, left: coords.left, width: 288 }}
            className="z-50 max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-card p-3 text-left shadow-lg"
          >
            <div className="mb-1 text-sm font-semibold">{entry.label}</div>
            <p className="text-sm text-muted">{entry.short}</p>
            <details className="group mt-2">
              <summary className="cursor-pointer list-none text-xs font-medium text-accent [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">How it works ›</span>
                <span className="hidden group-open:inline">How it works ⌄</span>
              </summary>
              <p className="mt-1 border-t border-border pt-2 text-xs leading-relaxed text-muted">{entry.more}</p>
            </details>
          </div>,
          document.body,
        )}
    </>
  );
}
