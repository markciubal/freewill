import { GraceMark } from "./grace-mark";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border bg-card p-4 ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{children}</h2>;
}

type Tone = "neutral" | "accent" | "danger" | "warn";
const badgeTones: Record<Tone, string> = {
  neutral: "border-border text-muted",
  accent: "border-accent text-accent",
  danger: "border-danger text-danger",
  warn: "border-warn text-warn",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

type Variant = "primary" | "ghost" | "danger";
const buttonVariants: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:opacity-90",
  ghost: "border border-border hover:bg-border/40",
  danger: "border border-danger text-danger hover:bg-danger/10",
};

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({ href, children, variant = "primary", className = "" }: { href: string; children: ReactNode; variant?: Variant; className?: string }) {
  return (
    <Link href={href} className={`inline-block rounded-md px-3 py-1.5 text-sm font-medium transition ${buttonVariants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${inputCls} ${className}`} {...props} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea className={inputCls} rows={4} {...props} />;
}
export function Select(props: ComponentProps<"select">) {
  return <select className={inputCls} {...props} />;
}

export function Notice({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <p className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>;
  if (ok) return <p className="mb-4 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">{ok}</p>;
  return null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">{children}</p>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function fmtHours(minutes: number) {
  const sign = minutes < 0 ? "-" : "";
  const m = Math.abs(minutes);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${sign}${h}h${r ? ` ${r}m` : ""}`;
}

export function fmtGrace(n: number) {
  return `${n < 0 ? "-" : ""}${Math.abs(n)} GRC`;
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
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap tabular-nums ${className}`}>
      {n < 0 && "-"}
      <GraceMark />
      {Math.abs(n)}
    </span>
  );
}
