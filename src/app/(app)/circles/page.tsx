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
        title="Circles"
        subtitle="When someone is harmed, they raise a circle. Keepers are drawn by lot from people of standing nearby. Everyone is heard. What is agreed is written down and kept public. Restitution, not punishment. No cages."
        action={<ScopeToggle scope={scope} base="/circles" locality={me.locality} />}
      />
      <Notice error={sp.error} />
      <div className="grid gap-8 md:grid-cols-[1fr_340px]">
        <section>
          {circles.length === 0 ? (
            <Empty>No circles. May it stay that way.</Empty>
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
                      Raised by @{c.raisedBy.username}{c.about ? ` about @${c.about.username}` : ""} / {c.locality}{c.distanceKm !== null ? ` / ${fmtDistance(c.distanceKm)} away` : ""} / {fmtDate(c.createdAt)} / {c.keeperIds.length} of {c.keepersNeeded} keepers
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="space-y-4">
          <Card>
            <SectionTitle>Your accusation credit</SectionTitle>
            <p className="text-sm">
              <span className="text-2xl font-semibold tabular-nums">{Math.max(0, standing.circleAllowance - openRaised)}</span>
              <span className="text-muted"> of {standing.circleAllowance} available</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              Raising a circle spends one until it closes. A circle found unfounded costs you standing and one credit for good. Standing earns more.
              Keeper pool here: about {keeperPoolSize(standing.localityPopulation)} of {standing.localityPopulation} people.
            </p>
          </Card>
          <Card>
            <SectionTitle>Raise a circle</SectionTitle>
            <form action={raiseCircle} className="space-y-3">
              <Field label="What this is about"><Input name="title" required minLength={3} maxLength={120} /></Field>
              <Field label="About whom (optional)" hint="Username. Leave blank if the harm has no single author."><Input name="about" placeholder="@someone" /></Field>
              <Field label="Your account" hint="What happened, in your own words. This will be public."><Textarea name="account" required minLength={10} maxLength={5000} rows={6} /></Field>
              <SubmitButton pendingText="Raising...">Raise it</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
