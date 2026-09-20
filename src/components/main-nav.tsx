"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/(auth)/actions";

// The header, organized into three task groups plus an account menu. Grouping,
// not a longer list: "what can I get or give", "who is here and how we decide",
// "what is around me". Each item carries a plain one-line descriptor.

type Item = { href: string; label: string; hint: string };
type Group = { id: string; label: string; items: Item[] };

const GROUPS: Group[] = [
  {
    id: "exchange",
    label: "Exchange",
    items: [
      { href: "/board", label: "Board", hint: "Needs & offers" },
      { href: "/ledger", label: "Ledger", hint: "Grace & Hours" },
      { href: "/commons", label: "Commons", hint: "Shared resources" },
      { href: "/seeds", label: "Seed bank", hint: "Seeds & plant exchange" },
      { href: "/cash", label: "Cash", hint: "Offline bearer notes" },
    ],
  },
  {
    id: "community",
    label: "Community",
    items: [
      { href: "/people", label: "People", hint: "Directory & vouching" },
      { href: "/circles", label: "Disputes", hint: "Repair harm together" },
      { href: "/assemblies", label: "Assemblies", hint: "Ranked-choice decisions" },
    ],
  },
  {
    id: "nearby",
    label: "Nearby",
    items: [
      { href: "/map", label: "Map", hint: "What's around you" },
      { href: "/bulletins", label: "Bulletins", hint: "Alerts & notices" },
    ],
  },
];

const ACCOUNT: Item[] = [
  { href: "/home", label: "Home", hint: "Your overview" },
  { href: "/profile", label: "Profile", hint: "You & your pin" },
  { href: "/theme", label: "Theme", hint: "Colors, type, shape" },
  { href: "/keys", label: "Identity key", hint: "Sign your vouches" },
  { href: "/programs", label: "Programs", hint: "What this is" },
  { href: "/sabul", label: "The critic", hint: "How power could still creep in" },
  { href: "/verify", label: "Verify ledger", hint: "Check the history yourself" },
  { href: "/wind-down", label: "Wind-down", hint: "The fail-safe, checked" },
  { href: "/support", label: "Support the server", hint: "Fund the infrastructure" },
];

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MainNav({ username }: { username: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const groupActive = (g: Group) => g.items.some((i) => isActive(i.href));
  const accountActive = ACCOUNT.some((i) => isActive(i.href));

  const itemLink = (i: Item) => (
    <Link
      key={i.href}
      href={i.href}
      role="menuitem"
      onClick={() => setOpen(null)}
      className={`flex flex-col rounded px-3 py-2 outline-none hover:bg-border/50 focus-visible:bg-border/50 ${isActive(i.href) ? "text-accent" : "text-foreground"}`}
    >
      <span className="text-sm font-medium">{i.label}</span>
      <span className="text-xs text-muted">{i.hint}</span>
    </Link>
  );

  const trigger = (id: string, label: string, active: boolean, extra = "") => (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={open === id}
      onClick={() => setOpen(open === id ? null : id)}
      className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm outline-none focus-visible:bg-border/50 ${active ? "font-medium text-foreground" : "text-muted hover:text-foreground"} ${extra}`}
    >
      {label}
      <Chevron open={open === id} />
    </button>
  );

  return (
    <div ref={rootRef} className="flex flex-1 items-center">
      {/* Desktop: three group menus, account menu on the right */}
      <nav className="hidden items-center gap-1 md:flex">
        {GROUPS.map((g) => (
          <div key={g.id} className="relative">
            {trigger(g.id, g.label, groupActive(g))}
            {open === g.id && (
              <div role="menu" className="absolute left-0 top-full z-30 mt-1 min-w-60 rounded-md border border-border bg-card p-1 shadow-lg">
                {g.items.map(itemLink)}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="relative ml-auto hidden md:block">
        {trigger("account", `@${username}`, accountActive)}
        {open === "account" && (
          <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-56 rounded-md border border-border bg-card p-1 shadow-lg">
            {ACCOUNT.map(itemLink)}
            <div className="my-1 border-t border-border" />
            <form action={logout}>
              <button type="submit" className="w-full rounded px-3 py-2 text-left text-sm text-muted outline-none hover:bg-border/50 focus-visible:bg-border/50">
                Log out
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Mobile: one menu holding every group plus the account items */}
      <div className="ml-auto md:hidden">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open === "mobile"}
          onClick={() => setOpen(open === "mobile" ? null : "mobile")}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted outline-none hover:text-foreground focus-visible:bg-border/50"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path d="M3 6h14M3 10h14M3 14h14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Menu
        </button>
      </div>
      {open === "mobile" && (
        <div role="menu" className="absolute inset-x-0 top-full z-30 mt-px border-t border-border bg-card p-2 shadow-lg md:hidden">
          {GROUPS.map((g) => (
            <div key={g.id} className="py-1">
              <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted">{g.label}</div>
              {g.items.map(itemLink)}
            </div>
          ))}
          <div className="mt-1 border-t border-border py-1">
            <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted">@{username}</div>
            {ACCOUNT.map(itemLink)}
            <form action={logout}>
              <button type="submit" className="w-full rounded px-3 py-2 text-left text-sm text-muted outline-none hover:bg-border/50 focus-visible:bg-border/50">
                Log out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
