"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY, type Term } from "@/lib/glossary";

// A small (i) beside one of the app's words. Hover it on a desktop, tap it on a
// phone, or Tab to it with a keyboard: a short plain explanation opens, with
// "More about ..." folded underneath for anyone who wants the full story, and a
// link to the page where they can see the thing for themselves.
//
// The pop-up uses the browser's own popover layer, which draws above every
// card and menu so nothing can clip it, while the pop-up stays right after its
// (i) in the page. That order is what lets Tab go from the (i) into the pop-up
// and reach "More about ...". It opens below the (i) when there is room and
// above it when there is not, and never runs off the screen. The dot is drawn
// at 16px but answers a tap about 28px across, so a thumb can hit it.

const WIDTH = 300;
const GAP = 6;
const EDGE = 8;
const SIGNED_OUT_PAGES = ["/join", "/login"];

export function InfoDot({ term, className = "" }: { term: Term; className?: string }) {
  const entry = GLOSSARY[term];
  const pathname = usePathname();
  const id = useId().replace(/[^a-z0-9]/gi, "");
  const popId = `info-${id}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  // Whether "More about ..." is unfolded. Every (i) opens short again.
  const [expanded, setExpanded] = useState(false);
  // Escape hands focus back to the (i); that one focus must not reopen it.
  const quietFocus = useRef(false);

  // Place the pop-up against its (i): centred, kept inside the screen, below
  // if it fits there and above otherwise, and no taller than the room it has.
  const place = () => {
    const button = buttonRef.current;
    const pop = popRef.current;
    if (!button || !pop) return;
    const b = button.getBoundingClientRect();
    const width = Math.min(WIDTH, window.innerWidth - EDGE * 2);
    pop.style.width = `${width}px`;
    pop.style.left = `${Math.min(Math.max(EDGE, b.left + b.width / 2 - width / 2), window.innerWidth - width - EDGE)}px`;
    pop.style.maxHeight = "none";
    const height = pop.scrollHeight;
    const roomBelow = window.innerHeight - b.bottom - GAP - EDGE;
    const roomAbove = b.top - GAP - EDGE;
    const below = roomBelow >= height || roomBelow >= roomAbove;
    const room = below ? roomBelow : roomAbove;
    pop.style.maxHeight = `${room}px`;
    pop.style.top = below ? `${b.bottom + GAP}px` : `${Math.max(EDGE, b.top - GAP - Math.min(height, room))}px`;
  };

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const scheduleClose = () => {
    if (pinned) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setExpanded(false);
    }, 140);
  };
  const hardClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(false);
    setPinned(false);
    setExpanded(false);
  };
  const onFocus = () => {
    if (quietFocus.current) {
      quietFocus.current = false;
      return;
    }
    show();
  };
  // Moving focus somewhere else on the page closes it, even if it was opened
  // with a click: the reader has moved on. Focus moving between the (i) and
  // its pop-up is not leaving.
  const onBlurWithin = (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && (buttonRef.current?.contains(next) || popRef.current?.contains(next))) return;
    if (next) hardClose();
    else if (!pinned) scheduleClose();
  };

  // Keep the browser's popover layer in step with `open`, and place it once it
  // is showing (it has to be showing to be measured). Unfolding "More about"
  // makes it taller, so it is placed again then too.
  useEffect(() => {
    const pop = popRef.current;
    if (!pop) return;
    if (open) {
      if (!pop.matches(":popover-open")) pop.showPopover();
      place();
    } else if (pop.matches(":popover-open")) {
      pop.hidePopover();
    }
  }, [open, expanded]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !popRef.current?.contains(target)) hardClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      hardClose();
      const button = buttonRef.current;
      if (button && document.activeElement !== button) {
        quietFocus.current = true;
        button.focus();
      }
    };
    // The pop-up is placed against the screen, so if the page moves it would
    // drift away from its (i). Scrolling inside the pop-up itself is fine.
    const onScroll = (event: Event) => {
      if (popRef.current?.contains(event.target as Node)) return;
      hardClose();
    };
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

  // No "See ..." link to the page you are already on, and none before you have
  // an account: it would only send you to the login page and lose what you typed.
  const seeHere = entry.see && pathname !== entry.see.href && !SIGNED_OUT_PAGES.includes(pathname) ? entry.see : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`About ${entry.label}`}
        aria-expanded={open}
        aria-controls={popId}
        aria-haspopup="dialog"
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onFocus={onFocus}
        onBlur={onBlurWithin}
        onClick={() => {
          if (open && pinned) hardClose();
          else {
            setPinned(true);
            show();
          }
        }}
        className={`relative inline-flex h-4 w-4 shrink-0 select-none items-center justify-center rounded-full border before:absolute before:-inset-1.5 before:content-[''] border-muted/50 align-[0.05em] text-[10px] font-semibold leading-none text-muted outline-none transition hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent ${className}`}
      >
        i
      </button>
      {/* Only elements allowed inside a sentence (spans, a button, a link),
          because an (i) often sits inside a paragraph or a heading, where a
          <div>, <p> or <details> would break the page apart. */}
      <span
        ref={popRef}
        id={popId}
        popover="manual"
        role="dialog"
        aria-labelledby={`${popId}-title`}
        data-info-pop=""
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onFocus={show}
        onBlur={onBlurWithin}
        className="fixed inset-auto m-0 overflow-y-auto overscroll-contain rounded-lg border border-border bg-card p-3 text-left text-sm font-normal normal-case tracking-normal text-foreground shadow-menu"
      >
        <span id={`${popId}-title`} className="mb-1 block font-semibold">
          {entry.label}
        </span>
        <span className="block text-muted">{entry.short}</span>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`${popId}-more`}
          onClick={() => {
            setExpanded((current) => !current);
            setPinned(true);
          }}
          className="mt-2 rounded text-xs font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {expanded ? "Less ⌃" : `More about ${entry.label.toLowerCase()} ›`}
        </button>
        <span id={`${popId}-more`} hidden={!expanded} className="mt-1 block border-t border-border pt-2 text-xs leading-relaxed text-muted">
          {entry.more}
          {seeHere && (
            <>
              {" "}
              <Link href={seeHere.href} onClick={hardClose} className="mt-2 block font-medium text-accent hover:underline">
                See {seeHere.label} ›
              </Link>
            </>
          )}
        </span>
      </span>
    </>
  );
}
