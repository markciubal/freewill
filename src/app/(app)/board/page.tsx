import Link from "next/link";
import type { Category } from "@prisma/client";
import { Badge, Card, Empty, Grace, LinkButton, Notice, PageTitle, ScopeToggle, SectionTitle, fmtHours } from "@/components/ui";
import { Examples } from "@/components/examples";
import { EXAMPLES } from "@/lib/examples";
import { requireUser } from "@/lib/auth";
import { readScope, scopeWhere } from "@/lib/form";
import { applyNear, fmtDistance } from "@/lib/geo";
import { CATEGORIES, CATEGORY_LABEL, SURVIVAL } from "@/lib/covenant";
import { findMatchesForUser } from "@/lib/matches";
import { db } from "@/lib/db";

type Search = { kind?: string; category?: string; error?: string; ok?: string; scope?: string };

function link(kind?: string, category?: string, scope?: string) {
  const q = new URLSearchParams();
  if (scope && scope !== "local") q.set("scope", scope);
  if (kind) q.set("kind", kind);
  if (category) q.set("category", category);
  const s = q.toString();
  return `/board${s ? `?${s}` : ""}`;
}

export default async function BoardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const scope = readScope(sp.scope);
  const kind = sp.kind === "OFFER" || sp.kind === "NEED" ? sp.kind : undefined;
  const category = CATEGORIES.includes(sp.category as Category) ? (sp.category as Category) : undefined;

  const matches = await findMatchesForUser(me);
  const listings = await db.listing.findMany({
    where: { status: { in: ["OPEN", "MATCHED"] }, kind, category, ...scopeWhere(scope, me.locality) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { owner: { select: { username: true } }, _count: { select: { pledges: true } } },
  });
  const near = applyNear(listings, me, scope);
  const urgent = (l: (typeof near)[number]) => l.kind === "NEED" && SURVIVAL.includes(l.category);
  const sorted = [...near].sort((a, b) => Number(urgent(b)) - Number(urgent(a)));

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted hover:text-foreground"}`;

  return (
    <div>
      <PageTitle
        title="Board"
        subtitle="Who needs what, who has what. Survival needs float to the top."
        action={<div className="flex flex-wrap items-center gap-3"><ScopeToggle scope={scope} base={link(kind, category)} locality={me.locality} /><LinkButton href="/board/new">Post a need or offer</LinkButton></div>}
      />
      <Notice error={sp.error} ok={sp.ok} />

      {matches.total > 0 && (
        <section className="mb-8">
          <SectionTitle>Possible trades for your open listings</SectionTitle>
          <div className="space-y-2">
            {matches.reciprocals.map((r) => (
              <Card key={r.other.id} className="border-accent/60">
                <div className="text-sm">
                  <span className="font-medium">Direct trade with @{r.other.username}</span>
                  {r.distanceKm !== null && <span className="text-muted"> ({fmtDistance(r.distanceKm)} away)</span>}
                  <span className="text-muted"> — no credit needed.</span>
                </div>
                <div className="mt-1 text-sm text-muted">
                  You offer <Link href={`/board/${r.myOffer.id}`} className="text-accent hover:underline">{r.myOffer.title}</Link>; they need{" "}
                  <Link href={`/board/${r.theirNeed.id}`} className="text-accent hover:underline">{r.theirNeed.title}</Link>. They offer{" "}
                  <Link href={`/board/${r.theirOffer.id}`} className="text-accent hover:underline">{r.theirOffer.title}</Link>; you need{" "}
                  <Link href={`/board/${r.myNeed.id}`} className="text-accent hover:underline">{r.myNeed.title}</Link>.
                </div>
              </Card>
            ))}
            {matches.counterparts.length > 0 && (
              <ul className="space-y-1">
                {matches.counterparts.map((c) => (
                  <li key={`${c.mine.id}-${c.theirs.id}`} className="text-sm">
                    For your {c.mine.kind === "NEED" ? "need" : "offer"}{" "}
                    <Link href={`/board/${c.mine.id}`} className="font-medium hover:underline">{c.mine.title}</Link>:{" "}
                    <Badge tone={c.theirs.kind === "NEED" ? "warn" : "accent"}>{c.theirs.kind}</Badge>{" "}
                    <Link href={`/board/${c.theirs.id}`} className="text-accent hover:underline">{c.theirs.title}</Link>{" "}
                    <span className="text-muted">from @{c.theirs.owner.username}{c.distanceKm !== null ? `, ${fmtDistance(c.distanceKm)} away` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <Link href={link(undefined, category, scope)} className={chip(!kind)}>All</Link>
        <Link href={link("NEED", category, scope)} className={chip(kind === "NEED")}>Needs</Link>
        <Link href={link("OFFER", category, scope)} className={chip(kind === "OFFER")}>Offers</Link>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={link(kind, undefined, scope)} className={chip(!category)}>Any category</Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={link(kind, c, scope)} className={chip(category === c)}>
            {CATEGORY_LABEL[c]}
          </Link>
        ))}
      </div>

      {sorted.length === 0 ? (
        <>
          <Empty>Nothing here yet. Post the first need or offer.</Empty>
          <Examples set={EXAMPLES.board} />
        </>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sorted.map((l) => (
            <li key={l.id}>
              <Link href={`/board/${l.id}`} className="block h-full rounded-lg border border-border bg-card p-4 hover:border-accent">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge tone={l.kind === "NEED" ? (urgent(l) ? "danger" : "warn") : "accent"}>{l.kind}</Badge>
                  <Badge>{CATEGORY_LABEL[l.category]}</Badge>
                  {l.status === "MATCHED" && <Badge>matched</Badge>}
                </div>
                <div className="font-medium">{l.title}</div>
                <div className="line-clamp-2 text-sm text-muted">{l.description}</div>
                <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
                  <span>@{l.owner.username}</span>
                  {l.locality && <span>{l.locality}</span>}
                  {l.distanceKm !== null && <span>{fmtDistance(l.distanceKm)} away</span>}
                  {l.quantity && <span>{l.quantity}</span>}
                  {l.wantsInReturn && <span>for: {l.wantsInReturn}</span>}
                  {l.priceGrace ? <Grace n={l.priceGrace} /> : null}
                  {l.priceHours ? <span>{fmtHours(l.priceHours)}</span> : null}
                  <span>{l._count.pledges} pledge{l._count.pledges === 1 ? "" : "s"}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
