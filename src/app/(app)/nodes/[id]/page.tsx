import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, Empty, Field, Grace, Input, Notice, PageTitle, SectionTitle, fmtDate, fmtDateTime, fmtHours, personName } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { WorkedSteps } from "@/components/worked-steps";
import { requireUser } from "@/lib/auth";
import { CATEGORY_LABEL, SURVIVAL } from "@/lib/covenant";
import { db } from "@/lib/db";
import { peerContents, peerTrustAll, trustSentence, type BundleBooks, type PeerAuthor } from "@/lib/federation";
import { isObjectId } from "@/lib/form";
import { fmtDistance, haversineKm } from "@/lib/geo";
import { keyFingerprint } from "@/lib/keys";
import { MONTHS, SEED_CATEGORY_LABEL, SEED_FORM_LABEL } from "@/lib/seeds";
import { getStanding } from "@/lib/standing.all";
import type { Category, SeedCategory, SeedForm } from "@prisma/client";
import { fetchPeerNow, sendToPeerNow, setPeerAddress, trustPeer, untrustPeer } from "../actions";

const VIA: Record<string, string> = { push: "sent by them", pull: "fetched", file: "brought by file" };

export default async function NodePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!isObjectId(id)) notFound();
  const peer = await db.peer.findUnique({ where: { id }, include: { addedBy: { select: { username: true, displayName: true } } } });
  if (!peer) notFound();

  const [trustAll, contents, ingests, standing] = await Promise.all([
    peerTrustAll(),
    peerContents(peer.id),
    db.peerIngest.findMany({ where: { peerId: peer.id }, orderBy: { receivedAt: "desc" }, take: 12, include: { by: { select: { username: true } } } }),
    getStanding(me.id),
  ]);
  const trust = trustAll.get(peer.id)!;
  const trusters = await db.user.findMany({ where: { id: { in: trust.trusterIds } }, select: { id: true, username: true, displayName: true } });
  const verifiedTrusters = new Set(trust.verifiedTrusterIds);
  const iTrust = trust.trusterIds.includes(me.id);
  const books = peer.books as BundleBooks | null;

  const where = (x: { author: PeerAuthor | null; locality: string | null; pin: { lat: number; lng: number } | null }) => {
    const parts = [x.author ? `@${x.author.username}` : "someone", peer.name];
    if (x.author?.signedVouches) parts.push(`${x.author.signedVouches} signed ${x.author.signedVouches === 1 ? "vouch" : "vouches"}`);
    if (x.locality) parts.push(x.locality);
    if (x.pin) parts.push(`about ${fmtDistance(haversineKm(me, x.pin))} away`);
    return parts.join(" / ");
  };
  const survivalFirst = (a: { category: string; createdAt: string }, b: { category: string; createdAt: string }) =>
    Number(SURVIVAL.includes(b.category as Category)) - Number(SURVIVAL.includes(a.category as Category)) || b.createdAt.localeCompare(a.createdAt);
  const listings = [...contents.listings].sort(survivalFirst);
  const rank = { URGENT: 0, HAZARD: 1, INFO: 2 } as const;
  const bulletins = [...contents.bulletins].sort((a, b) => rank[a.level] - rank[b.level] || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-8">
      <PageTitle
        title={peer.name}
        info="node"
        subtitle={`Another node, known by its key ${keyFingerprint(peer.publicKey)}. Added by ${personName(peer.addedBy)} on ${fmtDate(peer.createdAt)}. Everything below is what it published, shown as it sent it; nothing here can be changed from this node.`}
        action={<Link href="/nodes" className="text-sm text-accent hover:underline">All nodes</Link>}
      />
      <Notice error={sp.error} ok={sp.ok} />

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <SectionTitle>Trust</SectionTitle>
            {trust.trusted ? <Badge tone="accent">trusted</Badge> : <Badge>not trusted yet</Badge>}
          </div>
          <p className="text-sm">{trustSentence(trust.verifiedTrusterIds.length, trust.required)}</p>
          {trusters.length > 0 && (
            <p className="text-sm text-muted">
              Trusted by{" "}
              {trusters.map((u, i) => (
                <span key={u.id}>
                  {i > 0 && ", "}
                  <Link href={`/people/${u.username}`} className="hover:underline">{personName(u)}</Link>
                  {!verifiedTrusters.has(u.id) && " (not verified, so not counted)"}
                </span>
              ))}
              .
            </p>
          )}
          <p className="text-sm text-muted">
            Trust it only after checking its whole key with someone who lives there, by voice or on paper. Anyone can run a server and give it any name; the key is what cannot be faked.
          </p>
          <p className="break-all font-mono text-xs text-muted">{peer.publicKey}</p>
          {iTrust ? (
            <form action={untrustPeer.bind(null, peer.id)}>
              <SubmitButton variant="ghost" pendingText="Withdrawing...">Withdraw my trust</SubmitButton>
            </form>
          ) : standing.verified ? (
            <form action={trustPeer.bind(null, peer.id)}>
              <SubmitButton pendingText="Saving...">I have checked the key: trust it</SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-muted">Only verified members can trust another node, as only they can vouch.</p>
          )}
        </Card>

        <Card className="space-y-3">
          <SectionTitle>Exchange</SectionTitle>
          <p className="text-sm text-muted">
            {peer.url ? <>Its address is <span className="break-all font-mono text-xs text-foreground">{peer.url}</span>.</> : "No address is set, so its bundle can only arrive by file or be sent by it."}{" "}
            {peer.lastIngestAt ? `Last bundle taken in ${fmtDateTime(peer.lastIngestAt)}, signed ${fmtDateTime(peer.lastBundleAt!)}.` : "Nothing taken in yet."}
          </p>
          {peer.url && trust.trusted && (
            <div className="flex flex-wrap gap-2">
              <form action={fetchPeerNow.bind(null, peer.id)}>
                <SubmitButton pendingText="Fetching...">Fetch its bundle now</SubmitButton>
              </form>
              <form action={sendToPeerNow.bind(null, peer.id)}>
                <SubmitButton variant="ghost" pendingText="Sending...">Send ours now</SubmitButton>
              </form>
            </div>
          )}
          {!trust.trusted && <p className="text-sm text-muted">Nothing is fetched from it or sent to it until it is trusted.</p>}
          {standing.verified && iTrust && (
            <form action={setPeerAddress.bind(null, peer.id)} className="space-y-2">
              <Field label="Change its address" hint="Servers move; the key stays. Leave it empty to carry bundles only by hand.">
                <Input name="url" type="url" defaultValue={peer.url ?? ""} maxLength={300} placeholder="https://" />
              </Field>
              <Button type="submit" variant="ghost">Save address</Button>
            </form>
          )}
        </Card>
      </div>

      <WorkedSteps worked={trust.worked} tone={trust.trusted ? "accent" : "neutral"} />

      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <SectionTitle>Its ledger and books</SectionTitle>
          {peer.historyChangedAt && <Badge tone="warn">history changed</Badge>}
        </div>
        {peer.checkpointCount !== null && peer.checkpointRoot ? (
          <p className="text-sm">
            {peer.checkpointCount} {peer.checkpointCount === 1 ? "entry" : "entries"}, signed {fmtDateTime(peer.checkpointAt!)}. Root{" "}
            <span className="font-mono text-xs">{peer.checkpointRoot.slice(0, 16)}…</span>. Each new bundle must carry the history the last one did, so its past cannot be quietly rewritten.
          </p>
        ) : (
          <p className="text-sm text-muted">No ledger taken in yet.</p>
        )}
        {peer.historyChangedAt && (
          <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
            On {fmtDateTime(peer.historyChangedAt)} its ledger history no longer began with the part this node held. That happens when records there are rewritten, and also after a one-time repair of its ledger. Ask someone who lives there which it was.
          </p>
        )}
        {books && (
          <p className="text-sm text-muted">
            It says its books {books.balances ? "balance" : "do not balance"}, across {books.people} {books.people === 1 ? "person" : "people"}. This is its own word: another node cannot check its balances from outside. Its Grace and Hours are its own and do not move here.
          </p>
        )}
      </Card>

      <section>
        <SectionTitle>Its needs and offers</SectionTitle>
        {listings.length === 0 ? (
          <Empty>Nothing on its board right now.</Empty>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {listings.map((l) => (
              <li key={l.rowId}>
                <Card className="h-full space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={l.kind === "NEED" ? "warn" : "accent"}>{l.kind === "NEED" ? "Need" : "Offer"}</Badge>
                    <Badge>{CATEGORY_LABEL[l.category as Category]}</Badge>
                    {l.status === "MATCHED" && <Badge>matched</Badge>}
                  </div>
                  <div className="font-medium">{l.title}</div>
                  {l.description && <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted">{l.description}</p>}
                  <div className="text-sm">
                    {l.quantity && <span>{l.quantity}. </span>}
                    {l.wantsInReturn && <span>Would take: {l.wantsInReturn}. </span>}
                    {l.priceGrace !== null && <span>Asks <Grace n={l.priceGrace} /> of its own Grace. </span>}
                    {l.priceHours !== null && <span>Asks {fmtHours(l.priceHours)} of its Hours. </span>}
                    {l.priceGrace === null && l.priceHours === null && !l.wantsInReturn && <span>A gift. </span>}
                  </div>
                  <div className="text-xs text-muted">{where(l)}</div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Its notices</SectionTitle>
        {bulletins.length === 0 ? (
          <Empty>No current notices.</Empty>
        ) : (
          <ul className="space-y-2">
            {bulletins.map((b) => (
              <li key={b.rowId}>
                <Card className="flex items-start gap-3">
                  <Badge tone={b.level === "URGENT" ? "danger" : b.level === "HAZARD" ? "warn" : "neutral"}>{b.level}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{b.title}</div>
                    <p className="whitespace-pre-wrap text-sm text-muted">{b.body}</p>
                    <div className="mt-1 text-xs text-muted">
                      {where({ ...b, locality: b.locality ?? "everywhere" })}
                      {" / "}{fmtDateTime(new Date(b.createdAt))}
                      {b.expiresAt && ` / until ${fmtDateTime(new Date(b.expiresAt))}`}
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <SectionTitle>Its shared things</SectionTitle>
          {contents.commons.length === 0 ? (
            <Empty>No shared things listed.</Empty>
          ) : (
            <ul className="space-y-2">
              {contents.commons.map((c) => (
                <li key={c.rowId}>
                  <Card className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      <Badge>{CATEGORY_LABEL[c.category as Category]}</Badge>
                      {!c.available && <Badge tone="warn">not available now</Badge>}
                    </div>
                    {c.description && <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted">{c.description}</p>}
                    {c.rules && <p className="line-clamp-2 text-sm">Rules: {c.rules}</p>}
                    <div className="text-xs text-muted">Kept by {where(c)}</div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle>Its seeds</SectionTitle>
          {contents.seeds.length === 0 ? (
            <Empty>No seeds on offer.</Empty>
          ) : (
            <ul className="space-y-2">
              {contents.seeds.map((s) => (
                <li key={s.rowId}>
                  <Card className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <Badge>{SEED_FORM_LABEL[s.form as SeedForm]}</Badge>
                      <Badge>{SEED_CATEGORY_LABEL[s.category as SeedCategory]}</Badge>
                    </div>
                    {s.description && <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted">{s.description}</p>}
                    <div className="text-sm">
                      {s.quantity && <span>{s.quantity}. </span>}
                      {s.sowMonths.length > 0 && <span>Sow in {s.sowMonths.map((m) => MONTHS[m - 1]).join(", ")}.</span>}
                    </div>
                    <div className="text-xs text-muted">Grown by {where(s)}</div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <SectionTitle>Bundles from it</SectionTitle>
        {ingests.length === 0 ? (
          <Empty>No bundle has arrived from it yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {ingests.map((row) => (
              <li key={row.id}>
                <Card className="flex items-start gap-3 text-sm">
                  <Badge tone={row.outcome === "accepted" ? "accent" : row.outcome === "refused" ? "danger" : "neutral"}>
                    {row.outcome === "accepted" ? "taken in" : row.outcome === "refused" ? "refused" : "already had it"}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p>{row.note}</p>
                    <p className="mt-1 text-xs text-muted">
                      {fmtDateTime(row.receivedAt)} / {VIA[row.via] ?? row.via}
                      {row.by && <> by <Link href={`/people/${row.by.username}`} className="hover:underline">@{row.by.username}</Link></>}
                    </p>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
