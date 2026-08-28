import Link from "next/link";
import { Badge, Card, Empty, Field, Input, Notice, PageTitle, ScopeToggle, SectionTitle, Select, Textarea, fmtDateTime } from "@/components/ui";
import { readScope } from "@/lib/form";
import { applyNear, fmtDistance } from "@/lib/geo";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { postBulletin } from "./actions";

export default async function BulletinsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; scope?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const scope = readScope(sp.scope);
  const bulletins = await db.bulletin.findMany({
    where: {
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        scope === "local" ? { OR: [{ locality: me.locality }, { locality: null }] } : {},
      ],
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    include: { author: { select: { username: true } } },
  });
  const rank = { URGENT: 0, HAZARD: 1, INFO: 2 } as const;
  // "Near" keeps everywhere-bulletins too: they have no pin but apply to all.
  const withDistance = applyNear(bulletins, me, scope === "near" ? "all" : scope);
  const nearOnly = scope === "near" ? withDistance.filter((b) => b.locality === null || (b.distanceKm !== null && b.distanceKm <= 10)) : withDistance;
  const sorted = [...nearOnly].sort((a, b) => rank[a.level] - rank[b.level]);

  return (
    <div className="space-y-8">
      <PageTitle title="Bulletins" subtitle="Notices and hazards, each under a real name. Rumor kills; this is the antidote. Set an expiry so stale alerts do not linger."
        action={<ScopeToggle scope={scope} base="/bulletins" locality={me.locality} />}
      />
      <Notice error={sp.error} ok={sp.ok} />
      <div className="grid gap-8 md:grid-cols-[1fr_340px]">
        <section>
          {sorted.length === 0 ? (
            <Empty>Nothing posted.</Empty>
          ) : (
            <ul className="space-y-2">
              {sorted.map((b) => (
                <li key={b.id}>
                  <Card className="flex items-start gap-3">
                    <Badge tone={b.level === "URGENT" ? "danger" : b.level === "HAZARD" ? "warn" : "neutral"}>{b.level}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{b.title}</div>
                      <p className="whitespace-pre-wrap text-sm text-muted">{b.body}</p>
                      <div className="mt-1 text-xs text-muted">
                        <Link href={`/people/${b.author.username}`} className="hover:underline">@{b.author.username}</Link>
                        {" / "}{b.locality ?? "everywhere"}{b.distanceKm !== null ? ` / ${fmtDistance(b.distanceKm)} away` : ""}{" / "}{fmtDateTime(b.createdAt)}
                        {b.expiresAt && ` / until ${fmtDateTime(b.expiresAt)}`}
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Card className="h-fit">
          <SectionTitle>Post a bulletin</SectionTitle>
          <form action={postBulletin} className="space-y-3">
            <Field label="Level">
              <Select name="level" defaultValue="INFO">
                <option value="INFO">Info</option>
                <option value="HAZARD">Hazard</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </Field>
            <Field label="Title"><Input name="title" required minLength={3} maxLength={120} /></Field>
            <Field label="Details"><Textarea name="body" required minLength={3} maxLength={3000} rows={4} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="everywhere" /> Show everywhere, not just {me.locality}</label>
            <Field label="Expires in (days)" hint="0 or blank: never."><Input name="expiresInDays" type="number" min={0} max={365} defaultValue={7} /></Field>
            <SubmitButton pendingText="Posting...">Post under my name</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
