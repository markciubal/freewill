import Link from "next/link";
import type { SeedCategory } from "@prisma/client";
import { Badge, Card, Empty, Field, Input, Notice, PageTitle, ScopeToggle, SectionTitle, Select, Textarea } from "@/components/ui";
import { Examples } from "@/components/examples";
import { EXAMPLES } from "@/lib/examples";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readScope, scopeWhere } from "@/lib/form";
import { applyNear, fmtDistance } from "@/lib/geo";
import {
  MONTHS,
  SEED_CATEGORIES,
  SEED_CATEGORY_LABEL,
  SEED_FORMS,
  SEED_FORM_LABEL,
  currentMonth,
  formatSowMonths,
  sowableIn,
} from "@/lib/seeds";
import { createSeedShare } from "./actions";

type Search = { error?: string; ok?: string; scope?: string; category?: string; sow?: string };

export default async function SeedsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const scope = readScope(sp.scope);
  const category = SEED_CATEGORIES.includes(sp.category as SeedCategory) ? (sp.category as SeedCategory) : undefined;
  const sowNow = sp.sow === "now";
  const month = currentMonth();

  const sharesRaw = await db.seedShare.findMany({
    where: { available: true, category, ...scopeWhere(scope, me.locality) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { steward: { select: { username: true } }, _count: { select: { requests: { where: { status: "RETURNED" } } } } },
  });
  const near = applyNear(sharesRaw, me, scope);
  const shares = sowNow ? near.filter((s) => sowableIn(s.sowMonths, month)) : near;

  const link = (patch: Partial<Search>) => {
    const q = new URLSearchParams();
    const s = { scope, category, sow: sowNow ? "now" : undefined, ...patch };
    if (s.scope && s.scope !== "local") q.set("scope", s.scope);
    if (s.category) q.set("category", s.category as string);
    if (s.sow === "now") q.set("sow", "now");
    const str = q.toString();
    return `/seeds${str ? `?${str}` : ""}`;
  };
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted hover:text-foreground"}`;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Seed bank"
        subtitle="Locally saved seed, seedlings, cuttings, and tubers, shared as a gift. The old rule keeps the bank alive: take what you will plant, and return seed at harvest."
        action={<ScopeToggle scope={scope} base={link({})} locality={me.locality} />}
      />
      <Notice error={sp.error} ok={sp.ok} />

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Link href={link({ sow: sowNow ? undefined : "now" })} className={chip(sowNow)}>
              Sow now ({MONTHS[month - 1]})
            </Link>
            <Link href={link({ category: undefined })} className={chip(!category)}>Any type</Link>
            {SEED_CATEGORIES.map((c) => (
              <Link key={c} href={link({ category: c })} className={chip(category === c)}>
                {SEED_CATEGORY_LABEL[c]}
              </Link>
            ))}
          </div>

          {shares.length === 0 ? (
            <>
              <Empty>{sowNow ? "Nothing to sow this month here. Widen the area or clear the filter." : "No varieties shared yet. Add the first from your own saved seed."}</Empty>
              {!sowNow && <Examples set={EXAMPLES.seeds} />}
            </>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {shares.map((s) => (
                <li key={s.id}>
                  <Link href={`/seeds/${s.id}`} className="block h-full rounded-lg border border-border bg-card p-4 hover:border-accent">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone="accent">{SEED_FORM_LABEL[s.form]}</Badge>
                      <Badge>{SEED_CATEGORY_LABEL[s.category]}</Badge>
                      {s.openPollinated === true && <Badge tone="accent">open-pollinated</Badge>}
                      {s.openPollinated === false && <Badge tone="warn">hybrid</Badge>}
                    </div>
                    <div className="font-medium">{s.name}</div>
                    <div className="line-clamp-2 text-sm text-muted">{s.description}</div>
                    <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
                      <span>@{s.steward.username}</span>
                      {s.locality && <span>{s.locality}</span>}
                      {s.distanceKm !== null && <span>{fmtDistance(s.distanceKm)} away</span>}
                      <span>sow: {formatSowMonths(s.sowMonths)}</span>
                      {s._count.requests > 0 && <span>{s._count.requests} returned</span>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Card className="h-fit">
          <SectionTitle>Share a variety</SectionTitle>
          <form action={createSeedShare} className="space-y-3">
            <Field label="Name" hint="Be specific: variety, not just crop.">
              <Input name="name" required minLength={2} maxLength={80} placeholder="Cherokee Purple tomato" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Form">
                <Select name="form" defaultValue="SEED">
                  {SEED_FORMS.map((f) => <option key={f} value={f}>{SEED_FORM_LABEL[f]}</option>)}
                </Select>
              </Field>
              <Field label="Type">
                <Select name="category" defaultValue="VEGETABLE">
                  {SEED_CATEGORIES.map((c) => <option key={c} value={c}>{SEED_CATEGORY_LABEL[c]}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Notes" hint="Growing tips, flavor, what you traded it from.">
              <Textarea name="description" required minLength={3} maxLength={2000} rows={3} />
            </Field>
            <Field label="Open-pollinated?" hint="Open-pollinated seed comes true and can be saved. Hybrids (F1) usually cannot.">
              <Select name="openPollinated" defaultValue="unknown">
                <option value="yes">Yes, saveable</option>
                <option value="no">No, hybrid</option>
                <option value="unknown">Not sure</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity"><Input name="quantity" maxLength={60} placeholder="~40 seeds" /></Field>
              <Field label="Year saved"><Input name="yearSaved" type="number" min={1900} max={2100} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Days to maturity"><Input name="daysToMaturity" type="number" min={1} max={3650} /></Field>
              <Field label="Sow months" hint="e.g. 3-6 or Mar, Apr"><Input name="sowMonths" maxLength={120} placeholder="3-5" /></Field>
            </div>
            <SubmitButton pendingText="Sharing...">Add to the bank</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
