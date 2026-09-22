import Link from "next/link";
import type { ReactNode } from "react";
import { MainNav } from "@/components/main-nav";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen flex-col">
      {/* The first thing a keyboard reaches: a way past the menu to the page. */}
      <a href="#main" className="sr-only rounded-md bg-card px-3 py-2 text-sm font-medium text-accent shadow-raised focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50">
        Skip to the page
      </a>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-card/85 shadow-card backdrop-blur-md">
        <div className="relative mx-auto flex max-w-(--content-width) items-center gap-x-4 px-4 py-3">
          <Link href="/home" className="font-semibold tracking-tight">
            Freewill
          </Link>
          <MainNav username={user.username} />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-(--content-width) flex-1 px-4 py-8 outline-none">{children}</main>
      <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted">
        Run by its members, owned by no one. <Link href="/about" className="text-accent hover:underline">What this is, and what it cannot do</Link>.
      </footer>
    </div>
  );
}
