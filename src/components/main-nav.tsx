"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/(auth)/actions";

// The header, organized into four task groups plus an account menu. Grouping,
// not a longer list: "what can I get or give", "who is here and how we decide",
// "what is around me", "how this works and how to check it". The account menu
// holds only things about you. Each item carries a plain one-line descriptor.

type Item = { href: string; label: string; hint: string };
type Group = { id: string; label: string; items: Item[] };

const GROUPS: Group[] = [
  {
    id: "exchange",
    label: "Exchange",
    items: [
      { href: "/board", label: "Board", hint: "Needs & offers" },
      { href: "/ledger", label: "Ledger", hint: "Grace & Hours" },
      { href: "/cash", label: "Cash", hint: "Offline bearer notes" },
      { href: "/commons", label: "Commons", hint: "Shared resources" },
      { href: "/seeds", label: "Seed bank", hint: "Seeds & plant exchange" },
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
  {
    id: "system",
    label: "How it works",
    items: [
      { href: "/about", label: "About", hint: "Mission, limits, sources" },
      { href: "/programs", label: "Programs", hint: "Every feature, and why" },
      { href: "/explain", label: "Show the work", hint: "Your numbers, step by step" },
      { href: "/verify", label: "Verify ledger", hint: "Check the history yourself" },
      { href: "/sabul", label: "The critic", hint: "How power could still creep in" },
      { href: "/wind-down", label: "Wind-down", hint: "The fail-safe, checked" },
      { href: "/support", label: "Support the server", hint: "Fund the infrastructure" },
    ],
  },
];

const ACCOUNT: Item[] = [
  { href: "/home", label: "Home", hint: "Your overview" },
  { href: "/profile", label: "Profile", hint: "You & your pin" },
  { href: "/keys", label: "Identity key", hint: "Sign your vouches" },
  { href: "/theme", label: "Theme", hint: "Colors, type, shape" },
];

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The mobile panel is as tall as the screen allows below the header and
// scrolls inside itself. It hangs from a sticky header, so without its own
// scroll anything below the bottom of the screen could never be reached: the
// panel moves with the page instead of letting the page move under it.
// Measured once when it opens; 100dvh then tracks the phone's browser bars
// showing and hiding.
function fitToScreen(panel: HTMLElement | null) {
  if (panel) panel.style.maxHeight = `calc(100dvh - ${Math.round(panel.getBoundingClientRect().top)}px)`;
}

export function MainNav({ username }: { username: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  // Which sections of the mobile menu are open. Several may be open at once.
  const [expanded, setExpanded] = useState<string[]>([]);
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

  // The desktop dropdowns are menus; the mobile panel is a list of links in
  // collapsible sections, which is not a menu, so its links carry no role.
  const itemLink = (i: Item, asMenuItem = true) => (
    <Link
      key={i.href}
      href={i.href}
      role={asMenuItem ? "menuitem" : undefined}
      onClick={() => setOpen(null)}
      className={`flex flex-col rounded px-3 py-2 outline-none hover:bg-border/50 focus-visible:bg-border/50 ${isActive(i.href) ? "text-accent" : "text-foreground"}`}
    >
      <span className="text-sm font-medium">{i.label}</span>
      <span className="text-xs text-muted">{i.hint}</span>
    </Link>
  );

  // The mobile menu's sections: the four groups, then the account.
  const mobileSections = [
    ...GROUPS.map((group) => ({ id: group.id, label: group.label, items: group.items, active: groupActive(group) })),
    { id: "account", label: `@${username}`, items: ACCOUNT, active: accountActive },
  ];

  // Opening the menu opens the section holding the page you are on, so where
  // you are and what sits next to it are one tap away; the rest stay folded.
  const openMobileMenu = () => {
    if (open === "mobile") return setOpen(null);
    setExpanded(mobileSections.filter((section) => section.active).map((section) => section.id));
    setOpen("mobile");
  };
  const toggleSection = (id: string) =>
    setExpanded((current) => (current.includes(id) ? current.filter((sectionId) => sectionId !== id) : [...current, id]));

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
      {/* Desktop: one dropdown per group, account menu on the right. The dropdowns are
          solid: a translucent, blurred panel inside the (itself blurred) header lets
          the page text show through sharply in Chromium. */}
      <nav className="hidden items-center gap-1 md:flex">
        {GROUPS.map((g) => (
          <div key={g.id} className="relative">
            {trigger(g.id, g.label, groupActive(g))}
            {open === g.id && (
              <div role="menu" className="absolute left-0 top-full z-30 mt-1 min-w-60 rounded-lg border border-border/70 bg-card p-1 shadow-menu">
                {g.items.map((item) => itemLink(item))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="relative ml-auto hidden md:block">
        {trigger("account", `@${username}`, accountActive)}
        {open === "account" && (
          <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-56 rounded-lg border border-border/70 bg-card p-1 shadow-menu">
            {ACCOUNT.map((item) => itemLink(item))}
            <div className="my-1 border-t border-border" />
            <form action={logout}>
              <button type="submit" className="w-full rounded px-3 py-2 text-left text-sm text-muted outline-none hover:bg-border/50 focus-visible:bg-border/50">
                Log out
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Mobile: one button opening every section as an accordion */}
      <div className="ml-auto md:hidden">
        <button
          type="button"
          aria-expanded={open === "mobile"}
          aria-controls="mobile-menu"
          onClick={openMobileMenu}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted outline-none hover:text-foreground focus-visible:bg-border/50"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path d="M3 6h14M3 10h14M3 14h14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Menu
        </button>
      </div>
      {open === "mobile" && (
        <nav
          id="mobile-menu"
          aria-label="Menu"
          ref={fitToScreen}
          className="absolute inset-x-0 top-full z-30 mt-px overflow-y-auto overscroll-contain border-t border-border/70 bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 shadow-menu md:hidden"
        >
          {mobileSections.map((section) => {
            const isOpen = expanded.includes(section.id);
            const panelId = `mobile-menu-${section.id}`;
            return (
              <div key={section.id} className="border-b border-border/60 last:border-b-0">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleSection(section.id)}
                  className={`flex min-h-12 w-full items-center justify-between rounded px-3 text-left text-sm outline-none focus-visible:bg-border/50 ${section.active ? "font-semibold text-foreground" : "font-medium text-muted"}`}
                >
                  <span className="flex items-center gap-2">
                    {section.label}
                    {section.active && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="(you are here)" />}
                  </span>
                  <Chevron open={isOpen} />
                </button>
                {/* Collapsing by grid rows animates the height without measuring
                    it; `inert` keeps the links of a closed section out of reach
                    of the keyboard and screen readers while they are hidden. */}
                <div
                  id={panelId}
                  inert={!isOpen}
                  className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <div className="pb-2">
                      {section.items.map((item) => itemLink(item, false))}
                      {section.id === "account" && (
                        <form action={logout}>
                          <button type="submit" className="w-full rounded px-3 py-2 text-left text-sm text-muted outline-none hover:bg-border/50 focus-visible:bg-border/50">
                            Log out
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      )}
    </div>
  );
}
