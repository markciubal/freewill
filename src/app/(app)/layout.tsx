import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/(auth)/actions";
import { requireUser } from "@/lib/auth";

const NAV = [
  ["/home", "Home"],
  ["/board", "Board"],
  ["/map", "Map"],
  ["/ledger", "Ledger"],
  ["/people", "People"],
  ["/commons", "Commons"],
  ["/circles", "Disputes"],
  ["/assemblies", "Assemblies"],
  ["/bulletins", "Bulletins"],
  ["/programs", "Programs"],
] as const;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-(--content-width) flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/home" className="font-semibold tracking-tight">
            Freewill
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="text-muted hover:text-foreground">
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/profile" className="hover:underline">
              @{user.username}
            </Link>
            <Link href="/theme" className="text-muted hover:text-foreground" title="Colors, type, shape">
              Theme
            </Link>
            <form action={logout}>
              <button className="text-muted hover:text-foreground">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-(--content-width) flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted">
        Run by its members, owned by no one.
      </footer>
    </div>
  );
}
