import Link from "next/link";
import { Badge, Card, Empty, Field, Input, Notice, PageTitle, ScopeToggle, SectionTitle, Textarea, fmtDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readScope, scopeWhere } from "@/lib/form";
import { getStanding } from "@/lib/standing.all";
import { createProposal } from "./actions";

export default async function AssembliesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; scope?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const scope = readScope(sp.scope);
  const [proposals, standing] = await Promise.all([
    db.proposal.findMany({
      where: scopeWhere(scope, me.locality),
      orderBy: { closesAt: "desc" },
      take: 100,
      include: { author: { select: { username: true } }, _count: { select: { ballots: true } } },
    }),
    getStanding(me.id),
  ]);
  const now = new Date();

  return (
    <div className="space-y-8">
      <PageTitle
        title="Assemblies"
        subtitle="Questions put to the people of a locality, decided by ranked choice. Rank what you can live with, first to last. The count runs instant runoffs until one option holds a majority."
        action={<ScopeToggle scope={scope} base="/assemblies" locality={me.locality} near={false} />}
      />
      <Notice error={sp.error} ok={sp.ok} />
      <div className="grid gap-8 md:grid-cols-[1fr_340px]">
        <section>
          {proposals.length === 0 ? (
            <Empty>No open questions.</Empty>
          ) : (
            <ul className="space-y-2">
              {proposals.map((p) => {
                const open = p.closesAt > now;
                return (
                  <li key={p.id}>
                    <Link href={`/assemblies/${p.id}`} className="block rounded-lg border border-border bg-card p-4 hover:border-accent">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={open ? "accent" : "neutral"}>{open ? "open" : "closed"}</Badge>
                        <span className="font-medium">{p.title}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        @{p.author.username} / {p.locality} / {p.options.length} options / {p._count.ballots} ballot{p._count.ballots === 1 ? "" : "s"} / {open ? "closes" : "closed"} {fmtDateTime(p.closesAt)}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <Card className="h-fit">
          <SectionTitle>Put a question to {me.locality}</SectionTitle>
          {!standing.verified ? (
            <p className="text-sm text-muted">Only verified people can propose or vote. You need {standing.requiredVouches} vouch{standing.requiredVouches === 1 ? "" : "es"} from people in {me.locality}.</p>
          ) : (
            <form action={createProposal} className="space-y-3">
              <Field label="Question"><Input name="title" required minLength={3} maxLength={120} placeholder="Where should the second well go?" /></Field>
              <Field label="Context"><Textarea name="body" required minLength={10} maxLength={5000} rows={4} /></Field>
              <Field label="Options, one per line" hint="Two to ten."><Textarea name="options" required rows={4} placeholder={"Behind the mill\nNorth field\nDo not dig a second well"} /></Field>
              <Field label="Open for (days)"><Input name="closesInDays" type="number" min={1} max={30} defaultValue={7} /></Field>
              <SubmitButton pendingText="Posting...">Put it to the assembly</SubmitButton>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
