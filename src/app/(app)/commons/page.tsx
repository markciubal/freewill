import Link from "next/link";
import { Badge, Card, Empty, Field, Input, Notice, PageTitle, ScopeToggle, SectionTitle, Select, Textarea } from "@/components/ui";
import { readScope, scopeWhere } from "@/lib/form";
import { applyNear, fmtDistance } from "@/lib/geo";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/covenant";
import { db } from "@/lib/db";
import { DORMANT_DAYS, commonsHealth, type Entry } from "@/lib/commons";
import { createCommons } from "./actions";
import { InfoDot } from "@/components/info-dot";


export default async function CommonsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; scope?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const scope = readScope(sp.scope);
  const commons = applyNear(await db.commons.findMany({ where: scopeWhere(scope, me.locality), orderBy: { createdAt: "desc" }, include: { steward: { select: { username: true } }, entries: { select: { id: true, userId: true, kind: true, createdAt: true } } } }), me, scope);

  return (
    <div className="space-y-8">
      <PageTitle
        title="Commons"
        subtitle="Shared resources: wells, tool libraries, seed banks, kitchens, clinics, radios. Each has a steward who keeps it usable, rules its users decide, and a record where anyone who uses it says so."
        action={<ScopeToggle scope={scope} base="/commons" locality={me.locality} />}
      />
      <Notice error={sp.error} ok={sp.ok} />

      <div className="grid gap-8 md:grid-cols-[1fr_320px]">
        <section>
          {commons.length === 0 ? (
            <Empty>No shared resources yet. Add the first one.</Empty>
          ) : (
            <ul className="space-y-3">
              {commons.map((c) => (
                <li key={c.id}>
                  <Card className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/commons/${c.id}`} className="font-medium text-accent hover:underline">{c.name}</Link>
                      <Badge>{CATEGORY_LABEL[c.category]}</Badge>
                      <Badge tone={c.available ? "accent" : "danger"}>{c.available ? "available" : "unavailable"}</Badge>
                      {commonsHealth(c, c.entries as Entry[]).stewardSilent && <Badge tone="danger">steward quiet</Badge>}
                    </div>
                    <p className="text-sm text-muted">{c.description}</p>
                    {c.rules && (
                      <div className="rounded-md border border-border p-2 text-xs">
                        <div className="mb-1 font-medium">Rules</div>
                        <p className="whitespace-pre-wrap text-muted">{c.rules}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                      <span>Steward <Link href={`/people/${c.steward.username}`} className="hover:underline">@{c.steward.username}</Link></span>
                      {c.locality && <span>{c.locality}</span>}
                      {c.distanceKm !== null && <span>{fmtDistance(c.distanceKm)} away</span>}
                      <span>{commonsHealth(c, c.entries as Entry[]).usesInWindow} use{commonsHealth(c, c.entries as Entry[]).usesInWindow === 1 ? "" : "s"} recorded in {DORMANT_DAYS} days</span>
                      <Link href={`/commons/${c.id}`} className="text-accent hover:underline">Open its record</Link>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Card className="h-fit">
          <SectionTitle>Add a shared resource <InfoDot term="commons" /></SectionTitle>
          <form action={createCommons} className="space-y-3">
            <Field label="Name"><Input name="name" required minLength={2} maxLength={80} placeholder="North well / Tool shed / Seed bank" /></Field>
            <Field label="Category">
              <Select name="category" defaultValue="TOOLS">
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </Select>
            </Field>
            <Field label="What it is"><Textarea name="description" required rows={3} maxLength={2000} /></Field>
            <Field label="Rules (optional)" hint="Agreed with the people who use it. Keep them short."><Textarea name="rules" rows={3} maxLength={2000} /></Field>
            <Field label="Locality"><Input value={me.locality} disabled /></Field>
            <SubmitButton pendingText="Adding...">Add it, with me as steward</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
