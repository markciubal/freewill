import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getCurrentUser()) redirect("/home");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-6 text-lg font-semibold tracking-tight">
        Freewill
      </Link>
      <div className="w-full max-w-xl rounded-lg border border-border bg-card p-6">{children}</div>
    </div>
  );
}
