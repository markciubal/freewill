import Link from "next/link";
import type { ReactNode } from "react";
import { MainNav } from "@/components/main-nav";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-card/85 shadow-card backdrop-blur-md">
        <div className="relative mx-auto flex max-w-(--content-width) items-center gap-x-4 px-4 py-3">
          <Link href="/home" className="font-semibold tracking-tight">
            Freewill
          </Link>
          <MainNav username={user.username} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-(--content-width) flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted">
        Run by its members, owned by no one.
      </footer>
    </div>
  );
}
