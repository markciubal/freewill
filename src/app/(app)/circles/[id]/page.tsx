import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, Field, Notice, PageTitle, SectionTitle, Select, Textarea, fmtDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isObjectId } from "@/lib/form";
import { declineKeeping, dismissCircle, redrawKeepers, resolveCircle } from "../actions";

const OUTCOME = { HARM_FOUND: "Harm found", NO_HARM: "No harm", UNFOUNDED: "Unfounded accusation" } as const;

export default async function CirclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!isObjectId(id)) notFound();
  const c = await db.circle.findUnique({
    where: { id },
    include: { raisedBy: { select: { username: true } }, about: { select: { username: true } } },
  });
  if (!c) notFound();
  const keepers = c.keeperIds.length
    ? await db.user.findMany({ where: { id: { in: c.keeperIds } }, select: { id: true, username: true } })
    : [];
  const open = c.status === "OPEN" || c.status === "GATHERING";
  const isKeeper = c.keeperIds.includes(me.id);
  const short = c.keepersNeeded - c.keeperIds.length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle
        title={c.title}
        subtitle={`Raised by @${c.raisedBy.username}${c.about ? ` about @${c.about.username}` : ""} in ${c.locality} on ${fmtDate(c.createdAt)}`}
        action={<Link href="/circles" className="text-sm text-accent hover:underline">All circles</Link>}
      />
      <Notice error={sp.error} />

      <Card className="space-y-3">
        <div className="flex gap-2">
          <Badge tone={c.status === "RESOLVED" ? "accent" : c.status === "DISMISSED" ? "neutral" : "warn"}>{c.status}</Badge>
          {c.outcome && <Badge tone={c.outcome === "NO_HARM" ? "neutral" : "danger"}>{OUTCOME[c.outcome]}</Badge>}
        </div>
        <div>
          <SectionTitle>Account</SectionTitle>
          <p className="whitespace-pre-wrap text-sm">{c.account}</p>
        </div>
        {c.resolution && (
          <div className="rounded-md border border-accent/40 bg-accent/10 p-3">
            <SectionTitle>What was agreed</SectionTitle>
            <p className="whitespace-pre-wrap text-sm">{c.resolution}</p>
            {c.resolvedAt && <p className="mt-2 text-xs text-muted">Recorded {fmtDate(c.resolvedAt)}</p>}
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Keepers ({keepers.length} of {c.keepersNeeded}, drawn by lot)</SectionTitle>
        {keepers.length === 0 ? (
          <p className="text-sm text-muted">No keepers yet. Keepers are drawn at random from the highest-standing verified people in {c.locality}. They hear everyone and record what is agreed.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {keepers.map((k) => <li key={k.id}><Link href={`/people/${k.username}`} className="hover:underline">@{k.username}</Link>{k.id === me.id && <span className="text-muted"> (you)</span>}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {open && short > 0 && (
            <form action={redrawKeepers.bind(null, c.id)}><Button variant="ghost" type="submit">Draw {short} more</Button></form>
          )}
          {open && isKeeper && (
            <form action={declineKeeping.bind(null, c.id)}><Button variant="ghost" type="submit">Decline to keep (redraws my seat)</Button></form>
          )}
        </div>
      </Card>

      {open && isKeeper && (
        <Card>
          <SectionTitle>Record the resolution</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            Only after everyone has been heard. Harm found lowers the standing of the person named. Unfounded lowers the standing of the person who raised it and costs them accusation credit. No harm costs nobody.
          </p>
          <form action={resolveCircle.bind(null, c.id)} className="space-y-3">
            <Field label="Outcome">
              <Select name="outcome" defaultValue={c.aboutId ? "HARM_FOUND" : "NO_HARM"}>
                {c.aboutId && <option value="HARM_FOUND">{OUTCOME.HARM_FOUND}: @{c.about?.username} caused harm and will repair it</option>}
                <option value="NO_HARM">{OUTCOME.NO_HARM}: a misunderstanding, or nobody at fault</option>
                <option value="UNFOUNDED">{OUTCOME.UNFOUNDED}: the account was false or malicious</option>
              </Select>
            </Field>
            <Field label="What was agreed" hint="What will be repaired, by whom, by when."><Textarea name="resolution" required minLength={10} maxLength={5000} rows={6} /></Field>
            <SubmitButton pendingText="Recording...">Record and close</SubmitButton>
          </form>
        </Card>
      )}

      {open && c.raisedById === me.id && (
        <form action={dismissCircle.bind(null, c.id)}>
          <Button variant="ghost" type="submit">Withdraw this circle</Button>
        </form>
      )}
    </div>
  );
}
