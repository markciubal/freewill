import Link from "next/link";
import type { Category } from "@prisma/client";
import { Badge, Empty, Grace, LinkButton, Notice, PageTitle, ScopeToggle, fmtHours } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { readScope, scopeWhere } from "@/lib/form";
import { applyNear, fmtDistance } from "@/lib/geo";
import { CATEGORIES, CATEGORY_LABEL, SURVIVAL } from "@/lib/covenant";
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
        <Empty>Nothing here yet. Post the first need or offer.</Empty>
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
