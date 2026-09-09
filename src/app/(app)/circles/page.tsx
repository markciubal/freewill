import Link from "next/link";
import { Badge, Card, Empty, Field, Input, Notice, PageTitle, ScopeToggle, SectionTitle, Textarea, fmtDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readScope, scopeWhere } from "@/lib/form";
import { applyNear, fmtDistance } from "@/lib/geo";
import { keeperPoolSize } from "@/lib/keepers";
import { getStanding } from "@/lib/standing.all";
import { raiseCircle } from "./actions";

export default async function CirclesPage({ searchParams }: { searchParams: Promise<{ error?: string; scope?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const scope = readScope(sp.scope);
  const [circlesRaw, standing, openRaised] = await Promise.all([
    db.circle.findMany({
      where: scopeWhere(scope, me.locality),
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { raisedBy: { select: { username: true } }, about: { select: { username: true } } },
    }),
    getStanding(me.id),
    db.circle.count({ where: { raisedById: me.id, status: { in: ["OPEN", "GATHERING"] } } }),
  ]);
  const circles = applyNear(circlesRaw, me, scope);
  const tone = (s: string) => (s === "RESOLVED" ? "accent" : s === "DISMISSED" ? "neutral" : s === "GATHERING" ? "warn" : "danger") as "accent" | "neutral" | "warn" | "danger";
  const outcomeLabel = { HARM_FOUND: "harm found", NO_HARM: "no harm", UNFOUNDED: "unfounded" } as const;

  return (
    <div className="space-y-8">
      <PageTitle
        title="Disputes"
        subtitle="When someone has been wronged, they open a dispute. Mediators are drawn at random from trusted people nearby, everyone is heard, and what is agreed is written down publicly. The goal is repairing the harm, not punishing anyone."
        action={<ScopeToggle scope={scope} base="/circles" locality={me.locality} />}
      />
      <Notice error={sp.error} />
      <div className="grid gap-8 md:grid-cols-[1fr_340px]">
        <section>
          {circles.length === 0 ? (
            <Empty>No disputes.</Empty>
          ) : (
            <ul className="space-y-2">
              {circles.map((c) => (
                <li key={c.id}>
                  <Link href={`/circles/${c.id}`} className="block rounded-lg border border-border bg-card p-4 hover:border-accent">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={tone(c.status)}>{c.status}</Badge>
                      {c.outcome && <Badge tone={c.outcome === "NO_HARM" ? "neutral" : "danger"}>{outcomeLabel[c.outcome]}</Badge>}
                      <span className="font-medium">{c.title}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Opened by @{c.raisedBy.username}{c.about ? ` about @${c.about.username}` : ""} / {c.locality}{c.distanceKm !== null ? ` / ${fmtDistance(c.distanceKm)} away` : ""} / {fmtDate(c.createdAt)} / {c.keeperIds.length} of {c.keepersNeeded} mediators
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="space-y-4">
          <Card>
            <SectionTitle>Disputes you can open</SectionTitle>
            <p className="text-sm">
              <span className="text-2xl font-semibold tabular-nums">{Math.max(0, standing.circleAllowance - openRaised)}</span>
              <span className="text-muted"> of {standing.circleAllowance} available</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              Each open dispute you raise uses one slot until it closes. A dispute found to be unfounded costs you standing and a slot for good; higher standing earns more slots.
              Mediators here are drawn from a pool of about {keeperPoolSize(standing.localityPopulation)} of {standing.localityPopulation} people.
            </p>
          </Card>
          <Card>
            <SectionTitle>Open a dispute</SectionTitle>
            <form action={raiseCircle} className="space-y-3">
              <Field label="What this is about"><Input name="title" required minLength={3} maxLength={120} /></Field>
              <Field label="About whom (optional)" hint="Username. Leave blank if no single person is responsible."><Input name="about" placeholder="@someone" /></Field>
              <Field label="What happened" hint="In your own words. This will be public."><Textarea name="account" required minLength={10} maxLength={5000} rows={6} /></Field>
              <SubmitButton pendingText="Opening...">Open dispute</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
