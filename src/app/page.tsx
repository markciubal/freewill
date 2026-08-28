import Link from "next/link";
import { LinkButton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { COVENANT, TIERS } from "@/lib/covenant";
import { programsByTier } from "@/lib/covenant.programs";

export default async function Landing() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <header className="mb-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">Freewill</div>
        <h1 className="text-4xl font-semibold tracking-tight">
          A commons for a society without a state, where morality is the only law.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          No offices, no police, no treasury. Just people, their word, what they need, what they can give, and a
          way to repair harm when it happens. Built to keep neighbors civil when the government is gone or has
          turned on them.
        </p>
        <div className="mt-6 flex gap-3">
          {user ? (
            <LinkButton href="/home">Enter as @{user.username}</LinkButton>
          ) : (
            <>
              <LinkButton href="/join">Affirm the covenant and join</LinkButton>
              <LinkButton href="/login" variant="ghost">
                Return
              </LinkButton>
            </>
          )}
        </div>
      </header>

      <section className="mb-12">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">The Covenant</h2>
        <ol className="space-y-3">
          {COVENANT.map((c, i) => (
            <li key={c.title} className="rounded-lg border border-border bg-card p-4">
              <div className="font-medium">
                {i + 1}. {c.title}
              </div>
              <div className="mt-1 text-sm text-muted">{c.text}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">What is here</h2>
        <div className="space-y-6">
          {([0, 1, 2] as const).map((t) => (
            <div key={t}>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="font-medium">
                  Tier {t}: {TIERS[t].name}
                </span>
                <span className="text-xs text-muted">{TIERS[t].horizon}</span>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {programsByTier(t).map((p) => (
                  <li key={p.key} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
                    <span className="font-medium">{p.name}</span>
                    {p.status === "planned" && <span className="ml-2 text-xs text-muted">planned</span>}
                    <div className="text-xs text-muted">{p.summary}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">
          <Link href="/programs" className="text-accent hover:underline">
            Read why each program exists and in what order they matter.
          </Link>
        </p>
      </section>

      <footer className="border-t border-border pt-6 text-xs text-muted">No masters. No cages. Keep your word.</footer>
    </div>
  );
}
