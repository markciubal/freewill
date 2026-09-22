"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

// After a form comes back with an error, take the person to it. When the
// error names its field (failIssue in src/lib/form.ts adds ?field=, and forms
// using useActionState pass `field`), that field is marked invalid, pointed at
// the message, and focused, so a screen reader reads its name and then what
// is wrong with it, and a keyboard is already where it needs to be. Otherwise
// the message itself takes focus. Renders nothing.
export function ErrorFocus({ noticeId, message, field: named }: { noticeId: string; message: string; field?: string }) {
  const fromAddress = useSearchParams()?.get("field") ?? null;
  const field = named ?? fromAddress;

  useEffect(() => {
    const notice = document.getElementById(noticeId);
    const control = field ? document.querySelector<HTMLElement>(`[name="${CSS.escape(field)}"]:not([type="hidden"])`) : null;
    if (!control) {
      notice?.focus();
      return;
    }
    const described = control.getAttribute("aria-describedby");
    control.setAttribute("aria-invalid", "true");
    control.setAttribute("aria-describedby", [noticeId, described].filter(Boolean).join(" "));
    control.focus();
    return () => {
      control.removeAttribute("aria-invalid");
      if (described) control.setAttribute("aria-describedby", described);
      else control.removeAttribute("aria-describedby");
    };
  }, [noticeId, field, message]);

  return null;
}
