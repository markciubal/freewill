import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, Empty, Field, Grace, Input, Notice, PageTitle, SectionTitle, Stat, fmtDate, fmtHours } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { CATEGORY_LABEL } from "@/lib/covenant";
import { db } from "@/lib/db";
import { fmtDistance, haversineKm } from "@/lib/geo";
import { TIER_LABEL } from "@/lib/standing";
import { getStanding } from "@/lib/standing.all";
import { unvouch, vouch } from "../actions";

export default async function PersonPage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ error?: string }> }) {
  const me = await requireUser();
  const { username } = await params;
  const sp = await searchParams;
  const p = await db.user.findUnique({
    where: { username: username.toLowerCase() },
    select: {
      id: true, username: true, displayName: true, bio: true, locality: true, skills: true, createdAt: true, lat: true, lng: true,
      graceBalance: true, hoursBalance: true,
      vouchesReceived: { include: { from: { select: { username: true } } }, orderBy: { createdAt: "desc" } },
      listings: { where: { status: { in: ["OPEN", "MATCHED"] } }, orderBy: { createdAt: "desc" }, take: 10 },
      stewardships: { select: { id: true, name: true } },
    },
  });
  if (!p) notFound();
  const standing = await getStanding(p.id);
  const self = p.id === me.id;
  const myStanding = self ? standing : await getStanding(me.id);
  const myVouch = p.vouchesReceived.find((v) => v.fromId === me.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle
        title={p.displayName ?? `@${p.username}`}
        subtitle={`@${p.username} / ${p.locality}${p.id !== me.id ? ` / ${fmtDistance(haversineKm(me, p))} from you` : ""} / member since ${fmtDate(p.createdAt)}`}
        action={self ? <Link href="/profile" className="text-sm text-accent hover:underline">Edit profile</Link> : undefined}
      />
      <Notice error={sp.error} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><Stat label="Standing" value={TIER_LABEL[standing.tier]} sub={`${standing.score} pts / ${standing.verified ? "verified" : "not yet verified"}`} /></Card>
        <Card><Stat label="Vouches" value={standing.vouchesReceived} sub={`${standing.pledgesKept} pledges kept`} /></Card>
        <Card><Stat label="Balances" value={<Grace n={p.graceBalance} />} sub={fmtHours(p.hoursBalance)} /></Card>
      </div>
      {standing.harms > 0 && (
        <p className="text-sm text-danger">{standing.harms} resolved dispute{standing.harms === 1 ? "" : "s"} found this person caused harm. Read them before relying on this person.</p>
      )}

      {(p.bio || p.skills.length > 0) && (
        <Card className="space-y-2">
          {p.bio && <p className="whitespace-pre-wrap text-sm">{p.bio}</p>}
          <div className="flex flex-wrap gap-1">{p.skills.map((s) => <Badge key={s}>{s}</Badge>)}</div>
        </Card>
      )}

      {!self && !myStanding.verified && (
        <p className="text-sm text-muted">You cannot vouch for others until you are verified yourself ({myStanding.requiredVouches} vouch{myStanding.requiredVouches === 1 ? "" : "es"} from people in {me.locality}).</p>
      )}
      {!self && myStanding.verified && (
        <Card>
          <SectionTitle>{myVouch ? "You vouch for this person" : "Vouch for this person"}</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            A vouch says you know this person and trust them. It raises their standing and credit limit, so only vouch for people you actually know.
          </p>
          <form action={vouch.bind(null, p.username)} className="flex flex-wrap items-end gap-2">
            <div className="min-w-60 flex-1">
              <Field label="How do you know them? (optional)">
                <Input name="note" maxLength={200} defaultValue={myVouch?.note ?? ""} />
              </Field>
            </div>
            <SubmitButton pendingText="...">{myVouch ? "Update vouch" : "Vouch"}</SubmitButton>
          </form>
          {myVouch && (
            <form action={unvouch.bind(null, p.username)} className="mt-2">
              <Button variant="ghost" type="submit">Withdraw my vouch</Button>
            </form>
          )}
        </Card>
      )}

      <section>
        <SectionTitle>Vouched for by</SectionTitle>
        {p.vouchesReceived.length === 0 ? (
          <Empty>Nobody has vouched yet.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {p.vouchesReceived.map((v) => (
              <li key={v.id}>
                <Link href={`/people/${v.from.username}`} className="font-medium hover:underline">@{v.from.username}</Link>
                {v.note && <span className="text-muted">: {v.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {p.stewardships.length > 0 && (
        <section>
          <SectionTitle>Steward of</SectionTitle>
          <ul className="text-sm">{p.stewardships.map((c) => <li key={c.id}><Link href="/commons" className="hover:underline">{c.name}</Link></li>)}</ul>
        </section>
      )}

      <section>
        <SectionTitle>Open on the board</SectionTitle>
        {p.listings.length === 0 ? (
          <Empty>Nothing open.</Empty>
        ) : (
          <ul className="space-y-2">
            {p.listings.map((l) => (
              <li key={l.id}>
                <Link href={`/board/${l.id}`} className="block rounded-md border border-border bg-card px-3 py-2 hover:border-accent">
                  <Badge tone={l.kind === "NEED" ? "warn" : "accent"}>{l.kind}</Badge>{" "}
                  <span className="font-medium">{l.title}</span>
                  <span className="ml-2 text-xs text-muted">{CATEGORY_LABEL[l.category]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
