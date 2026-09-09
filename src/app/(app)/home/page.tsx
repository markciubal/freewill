import Link from "next/link";
import { Badge, Card, Empty, Grace, SectionTitle, Stat, fmtDateTime, fmtHours } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CATEGORY_LABEL, SURVIVAL } from "@/lib/covenant";
import { db } from "@/lib/db";
import { TIER_LABEL } from "@/lib/standing";
import { getStanding } from "@/lib/standing.all";

export default async function HomePage() {
  const user = await requireUser();
  const [standing, urgentNeeds, alerts, myPledges, awaitingMe] = await Promise.all([
    getStanding(user.id),
    db.listing.findMany({
      where: { kind: "NEED", status: "OPEN", category: { in: SURVIVAL } },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { owner: { select: { username: true } } },
    }),
    db.bulletin.findMany({
      where: { level: { in: ["HAZARD", "URGENT"] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { author: { select: { username: true } } },
    }),
    db.pledge.findMany({
      where: { userId: user.id, status: { in: ["OFFERED", "ACCEPTED"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { listing: { select: { id: true, title: true } } },
    }),
    db.pledge.findMany({
      where: { status: "OFFERED", listing: { ownerId: user.id, status: { in: ["OPEN", "MATCHED"] } } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { listing: { select: { id: true, title: true } }, user: { select: { username: true } } },
    }),
  ]);

  const row = "block rounded-md border border-border bg-card px-3 py-2 hover:border-accent";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{user.displayName ?? `@${user.username}`}</h1>
        <p className="text-sm text-muted">{user.locality}</p>
      </div>

      {standing.verified ? (
        <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
          You are verified in {user.locality} ({standing.vouchesReceived} of {standing.requiredVouches} needed vouch{standing.requiredVouches === 1 ? "" : "es"}). You can use credit, vouch for others, mediate disputes, and vote.
        </p>
      ) : (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          Not verified yet. You need {standing.requiredVouches} vouch{standing.requiredVouches === 1 ? "" : "es"} from people in {user.locality} ({standing.vouchesReceived} so far). Until then you can post, pledge, and earn, but not use credit, vouch, mediate, or vote.
          Start in the <Link href="/people" className="text-accent hover:underline">People</Link> directory.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Stat
            label="Standing"
            value={TIER_LABEL[standing.tier]}
            sub={`${standing.score} pts: ${standing.vouchesReceived} vouches, ${standing.pledgesKept} kept pledges`}
          />
        </Card>
        <Card>
          <Stat label="Grace" value={<Grace n={user.graceBalance} />} sub={<>may go to <Grace n={-standing.graceLimit} /></>} />
        </Card>
        <Card>
          <Stat label="Hours" value={fmtHours(user.hoursBalance)} sub={`may go to -${fmtHours(standing.hoursLimit)}`} />
        </Card>
      </div>

      {alerts.length > 0 && (
        <section>
          <SectionTitle>Alerts</SectionTitle>
          <div className="space-y-2">
            {alerts.map((b) => (
              <Card key={b.id} className="flex items-start gap-3">
                <Badge tone={b.level === "URGENT" ? "danger" : "warn"}>{b.level}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{b.title}</div>
                  <div className="text-sm text-muted">{b.body}</div>
                  <div className="mt-1 text-xs text-muted">
                    @{b.author.username} / {b.locality ?? "everywhere"} / {fmtDateTime(b.createdAt)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <SectionTitle>Urgent needs</SectionTitle>
          {urgentNeeds.length === 0 ? (
            <Empty>No urgent needs right now.</Empty>
          ) : (
            <ul className="space-y-2">
              {urgentNeeds.map((l) => (
                <li key={l.id}>
                  <Link href={`/board/${l.id}`} className={row}>
                    <div className="flex items-center gap-2">
                      <Badge tone="danger">{CATEGORY_LABEL[l.category]}</Badge>
                      <span className="font-medium">{l.title}</span>
                    </div>
                    <div className="text-xs text-muted">
                      @{l.owner.username} / {l.locality ?? "no locality"}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/board?kind=NEED" className="mt-2 inline-block text-sm text-accent hover:underline">
            All needs
          </Link>
        </section>

        <section className="space-y-6">
          <div>
            <SectionTitle>Pledges waiting on you</SectionTitle>
            {awaitingMe.length === 0 ? (
              <Empty>Nothing waiting on you.</Empty>
            ) : (
              <ul className="space-y-2">
                {awaitingMe.map((p) => (
                  <li key={p.id}>
                    <Link href={`/board/${p.listing.id}`} className={row}>
                      <span className="font-medium">@{p.user.username}</span> pledged on{" "}
                      <span className="font-medium">{p.listing.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <SectionTitle>Your open pledges</SectionTitle>
            {myPledges.length === 0 ? (
              <Empty>No open pledges.</Empty>
            ) : (
              <ul className="space-y-2">
                {myPledges.map((p) => (
                  <li key={p.id}>
                    <Link href={`/board/${p.listing.id}`} className={row}>
                      <div className="flex items-center gap-2">
                        <Badge tone={p.status === "ACCEPTED" ? "accent" : "neutral"}>{p.status}</Badge>
                        <span className="font-medium">{p.listing.title}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
