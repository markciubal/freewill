import { GraceMark } from "./grace-mark";
import { InfoDot } from "./info-dot";
import Link from "next/link";
import { Children, cloneElement, isValidElement, useId, type ComponentProps, type ReactNode } from "react";
import { ErrorFocus } from "./error-focus";
import type { Term } from "@/lib/glossary";

// `info` puts an (i) beside the title, explaining the word the page is about.
export function PageTitle({ title, subtitle, action, info }: { title: string; subtitle?: string; action?: ReactNode; info?: Term }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {title}
          {info && <> <InfoDot term={info} /></>}
        </h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border/70 bg-card p-4 shadow-card ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{children}</h2>;
}

type Tone = "neutral" | "accent" | "danger" | "warn";
const badgeTones: Record<Tone, string> = {
  neutral: "border-border bg-border/30 text-muted",
  accent: "border-accent/40 bg-accent/10 text-accent",
  danger: "border-danger/40 bg-danger/10 text-danger",
  warn: "border-warn/40 bg-warn/10 text-warn",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

type Variant = "primary" | "ghost" | "danger";
// Primary buttons get a faint top-to-bottom gradient and a tinted shadow so
// they read as something you can press; everything follows --elevation.
const buttonVariants: Record<Variant, string> = {
  primary: "bg-linear-to-b from-accent to-accent/85 text-accent-foreground shadow-raised hover:brightness-110 active:translate-y-px active:shadow-none",
  ghost: "border border-border bg-card/70 hover:bg-border/40 active:translate-y-px",
  danger: "border border-danger/60 bg-danger/5 text-danger hover:bg-danger/10 active:translate-y-px",
};

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 disabled:active:translate-y-0 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({ href, children, variant = "primary", className = "" }: { href: string; children: ReactNode; variant?: Variant; className?: string }) {
  return (
    <Link href={href} className={`inline-block rounded-md px-3 py-1.5 text-sm font-medium transition duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${buttonVariants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Field({ label, children, hint, info }: { label: string; children: ReactNode; hint?: string; info?: Term }) {
  // The hint sits after the label, not inside it: everything inside a <label>
  // becomes the field's name, so a screen reader would read the whole hint as
  // the name. Linked with aria-describedby instead, it is read after the name,
  // as a description. That needs one control to link, which is how every form
  // here is written (smoke:a11y holds the textareas to it).
  const hintId = useId();
  const control = hint ? describedBy(children, hintId) : children;
  const hintText = hint && <span id={hintId} className="mt-1 block text-xs text-muted">{hint}</span>;
  // An (i) cannot sit inside a <label>: a label hands its clicks and its name
  // to the first control inside it, which would be the (i) instead of the
  // input. So with an (i), the visible name and its (i) sit just above, and
  // the label still names the input for screen readers.
  if (info) {
    return (
      <div className="text-sm">
        <div className="mb-1 flex items-center gap-1 font-medium">
          <span aria-hidden="true">{label}</span>
          <InfoDot term={info} />
        </div>
        <label className="block">
          <span className="sr-only">{label}</span>
          {control}
        </label>
        {hintText}
      </div>
    );
  }
  return (
    <div className="text-sm">
      <label className="block">
        <span className="mb-1 block font-medium">{label}</span>
        {control}
      </label>
      {hintText}
    </div>
  );
}

// Give the one control inside a Field the id of its hint, keeping any
// description it already has. Anything other than a single element is left
// as it is: the hint still shows, just without the link.
function describedBy(children: ReactNode, id: string): ReactNode {
  const items = Children.toArray(children);
  if (items.length !== 1 || !isValidElement<{ "aria-describedby"?: string }>(items[0])) return children;
  const own = items[0].props["aria-describedby"];
  return cloneElement(items[0], { "aria-describedby": own ? `${own} ${id}` : id });
}

const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-inset outline-none transition duration-150 focus:border-accent focus:ring-2 focus:ring-accent/25";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${inputCls} ${className}`} {...props} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea className={inputCls} rows={4} {...props} />;
}
export function Select(props: ComponentProps<"select">) {
  return <select className={inputCls} {...props} />;
}

const NOTICE_ID = "form-notice";

// What happened after a form, said aloud as well as shown: an error is an
// alert, and focus goes to the field it is about (or to the message itself);
// good news is a polite status that does not interrupt. `field` is for forms
// whose state comes back from useActionState rather than in the address.
export function Notice({ error, ok, field }: { error?: string; ok?: string; field?: string }) {
  if (error) {
    return (
      <p id={NOTICE_ID} role="alert" tabIndex={-1} className="mb-4 rounded-md border border-danger/30 border-l-4 border-l-danger bg-danger/10 px-3 py-2 text-sm text-danger shadow-card outline-none focus-visible:ring-2 focus-visible:ring-danger/40">
        {error}
        <ErrorFocus noticeId={NOTICE_ID} message={error} field={field} />
      </p>
    );
  }
  if (ok) return <p role="status" className="mb-4 rounded-md border border-accent/30 border-l-4 border-l-accent bg-accent/10 px-3 py-2 text-sm text-accent shadow-card">{ok}</p>;
  return null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted">{children}</p>;
}

export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

// A real minus sign, not a hyphen: as wide as a plus, level with the digits,
// and read aloud as "minus".
export const MINUS = String.fromCharCode(0x2212);

export function fmtHours(minutes: number) {
  const sign = minutes < 0 ? MINUS : "";
  const m = Math.abs(minutes);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${sign}${h}h${r ? ` ${r}m` : ""}`;
}

// Grace is stored in cents (hundredths of a Grace). These format a cent amount
// for display: whole values show as integers, fractional ones to two places.
export function graceDigits(cents: number) {
  const v = Math.abs(Math.trunc(cents));
  const whole = Math.floor(v / 100);
  const frac = v % 100;
  return frac === 0 ? `${whole}` : `${whole}.${String(frac).padStart(2, "0")}`;
}

export function fmtGrace(cents: number) {
  return `${cents < 0 ? MINUS : ""}${graceDigits(cents)} GRC`;
}

// How a person's name shows: "Display Name : username" when they have set a
// display name, otherwise just their handle.
export function personName(u: { displayName?: string | null; username: string }) {
  return u.displayName ? `${u.displayName} : ${u.username}` : `@${u.username}`;
}

export function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(d: Date) {
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ScopeToggle({ scope, base, locality, near = true }: { scope: "local" | "near" | "all"; base: string; locality: string; near?: boolean }) {
  const sep = base.includes("?") ? "&" : "?";
  const cls = (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${on ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted hover:text-foreground"}`;
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`${base}${sep}scope=local`} className={cls(scope === "local")}>{locality}</Link>
      {near && <Link href={`${base}${sep}scope=near`} className={cls(scope === "near")}>Within 10 km</Link>}
      <Link href={`${base}${sep}scope=all`} className={cls(scope === "all")}>Everywhere</Link>
    </div>
  );
}

// A Grace amount with its mark, like "$20": the olive sprig then the number.
// Shows a minus for negatives; callers that print their own sign pass Math.abs.
export function Grace({ n, className = "" }: { n: number; className?: string }) {
  // `n` is a cent amount (hundredths of a Grace).
  return (
    <span className={`whitespace-nowrap tabular-nums ${className}`}>
      {n < 0 && MINUS}
      {/* A tenth of an em each side reads like the space in "$20" or "−$20". */}
      <GraceMark className={n < 0 ? "mx-[0.1em]" : "mr-[0.1em]"} />
      {graceDigits(n)}
    </span>
  );
}
