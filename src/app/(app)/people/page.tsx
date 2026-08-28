import Link from "next/link";
import { Badge, Empty, Field, Input, PageTitle, ScopeToggle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { readScope, scopeWhere } from "@/lib/form";
import { applyNear, fmtDistance } from "@/lib/geo";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; scope?: string }> }) {
  const me = await requireUser();
  const { q, scope: sc } = await searchParams;
  const scope = readScope(sc);
  const term = q?.trim().toLowerCase();
  const peopleRaw = await db.user.findMany({
    where: {
      ...scopeWhere(scope, me.locality),
      ...(term
        ? {
          OR: [
            { username: { contains: term } },
            { displayName: { contains: term, mode: "insensitive" } },
            { locality: { contains: term, mode: "insensitive" } },
            { skills: { has: term } },
          ],
        }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true, username: true, displayName: true, locality: true, skills: true, lat: true, lng: true,
      _count: { select: { vouchesReceived: true, pledges: { where: { status: "COMPLETED" } } } },
    },
  });

  const people = applyNear(peopleRaw, me, scope);
  return (
    <div>
      <PageTitle title="People" subtitle="Everyone here, and who can do what. Search by name, place, or skill (e.g. midwife, welding, water)."
        action={<ScopeToggle scope={scope} base={q ? `/people?q=${encodeURIComponent(q)}` : "/people"} locality={me.locality} />}
      />
      <form className="mb-6 flex max-w-md items-end gap-2">
        {scope === "all" && <input type="hidden" name="scope" value="all" />}
        <div className="flex-1"><Field label="Search"><Input name="q" defaultValue={q ?? ""} placeholder="skill, name, or place" /></Field></div>
        <SubmitButton variant="ghost">Find</SubmitButton>
      </form>
      {people.length === 0 ? (
        <Empty>Nobody matches.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <li key={p.id}>
              <Link href={`/people/${p.username}`} className="block h-full rounded-lg border border-border bg-card p-4 hover:border-accent">
                <div className="font-medium">{p.displayName ?? `@${p.username}`}</div>
                <div className="text-xs text-muted">@{p.username} / {p.locality}{p.id !== me.id && p.distanceKm !== null ? ` / ${fmtDistance(p.distanceKm)} away` : ""}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.skills.slice(0, 6).map((s) => <Badge key={s}>{s}</Badge>)}
                </div>
                <div className="mt-2 text-xs text-muted">
                  {p._count.vouchesReceived} vouch{p._count.vouchesReceived === 1 ? "" : "es"}, {p._count.pledges} kept
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
