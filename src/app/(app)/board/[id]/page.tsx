import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, Empty, Field, Grace, Notice, PageTitle, SectionTitle, Textarea, fmtDate, fmtGrace, fmtHours } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { CATEGORY_LABEL } from "@/lib/covenant";
import { db } from "@/lib/db";
import { isObjectId } from "@/lib/form";
import { completeListing, pledge, respondToPledge, withdrawListing } from "../actions";

export default async function ListingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!isObjectId(id)) notFound();
  const l = await db.listing.findUnique({
    where: { id },
    include: {
      owner: { select: { username: true, displayName: true } },
      pledges: { orderBy: { createdAt: "asc" }, include: { user: { select: { username: true } } } },
      transfers: { include: { from: { select: { username: true } }, to: { select: { username: true } } } },
    },
  });
  if (!l) notFound();

  const mine = l.ownerId === me.id;
  const open = l.status === "OPEN" || l.status === "MATCHED";
  const myPledge = l.pledges.find((p) => p.userId === me.id && (p.status === "OFFERED" || p.status === "ACCEPTED"));
  const hasPrice = !!(l.priceGrace || l.priceHours);
  const priceText = [l.priceGrace ? fmtGrace(l.priceGrace) : null, l.priceHours ? fmtHours(l.priceHours) : null].filter(Boolean).join(" + ");

  // Who may confirm completion for a given pledge: the payer.
  const canConfirm = (p: (typeof l.pledges)[number]) =>
    open && (p.status === "OFFERED" || p.status === "ACCEPTED") &&
    (l.kind === "NEED" ? mine : p.userId === me.id && p.status === "ACCEPTED");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle
        title={l.title}
        subtitle={`${l.kind === "NEED" ? "Need" : "Offer"} from @${l.owner.username}, posted ${fmtDate(l.createdAt)}`}
        action={<Link href="/board" className="text-sm text-accent hover:underline">Back to board</Link>}
      />
      <Notice error={sp.error} />

      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge tone={l.kind === "NEED" ? "warn" : "accent"}>{l.kind}</Badge>
          <Badge>{CATEGORY_LABEL[l.category]}</Badge>
          <Badge tone={l.status === "FULFILLED" ? "accent" : l.status === "WITHDRAWN" ? "danger" : "neutral"}>{l.status}</Badge>
        </div>
        <p className="whitespace-pre-wrap text-sm">{l.description}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {l.quantity && <div><dt className="text-xs text-muted">Quantity</dt><dd>{l.quantity}</dd></div>}
          {l.locality && <div><dt className="text-xs text-muted">Where</dt><dd>{l.locality}</dd></div>}
          {l.wantsInReturn && <div className="col-span-2"><dt className="text-xs text-muted">Would take in return</dt><dd>{l.wantsInReturn}</dd></div>}
          {hasPrice && <div><dt className="text-xs text-muted">Ask</dt><dd>{l.priceGrace ? <Grace n={l.priceGrace} /> : null}{l.priceGrace && l.priceHours ? " + " : ""}{l.priceHours ? fmtHours(l.priceHours) : null}</dd></div>}
          {!hasPrice && !l.wantsInReturn && <div><dt className="text-xs text-muted">Terms</dt><dd>Gift</dd></div>}
        </dl>
        {mine && open && (
          <form action={withdrawListing.bind(null, l.id)}>
            <Button variant="danger" type="submit">Withdraw</Button>
          </form>
        )}
      </Card>

      {!mine && open && !myPledge && (
        <Card>
          <SectionTitle>{l.kind === "NEED" ? "Pledge to meet this need" : "Pledge to take this offer"}</SectionTitle>
          <form action={pledge.bind(null, l.id)} className="space-y-3">
            <Field label="A word to go with it (optional)">
              <Textarea name="message" rows={2} maxLength={500} placeholder="When, how much, any conditions." />
            </Field>
            <SubmitButton pendingText="Pledging...">Give my word</SubmitButton>
          </form>
        </Card>
      )}

      <section>
        <SectionTitle>Pledges</SectionTitle>
        {l.pledges.length === 0 ? (
          <Empty>No pledges yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {l.pledges.map((p) => (
              <li key={p.id}>
                <Card className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/people/${p.user.username}`} className="font-medium hover:underline">@{p.user.username}</Link>
                    <Badge tone={p.status === "COMPLETED" ? "accent" : p.status === "DECLINED" ? "danger" : "neutral"}>{p.status}</Badge>
                    <span className="text-xs text-muted">{fmtDate(p.createdAt)}</span>
                  </div>
                  {p.message && <p className="text-sm text-muted">{p.message}</p>}
                  <div className="flex flex-wrap gap-2">
                    {mine && open && p.status === "OFFERED" && (
                      <>
                        <form action={respondToPledge.bind(null, p.id, "ACCEPTED")}><Button type="submit">Accept</Button></form>
                        <form action={respondToPledge.bind(null, p.id, "DECLINED")}><Button variant="ghost" type="submit">Decline</Button></form>
                      </>
                    )}
                    {canConfirm(p) && (
                      <form action={completeListing.bind(null, l.id, p.id)} className="flex flex-wrap items-center gap-3">
                        {hasPrice && (
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" name="settle" defaultChecked />
                            Settle {priceText} now
                          </label>
                        )}
                        <SubmitButton pendingText="Confirming...">
                          {l.kind === "NEED" ? "Confirm: my need was met" : "Confirm: I received it"}
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {l.transfers.length > 0 && (
        <section>
          <SectionTitle>Settled</SectionTitle>
          <ul className="space-y-1 text-sm">
            {l.transfers.map((t) => (
              <li key={t.id}>
                @{t.from.username} paid @{t.to.username} {t.ledger === "GRACE" ? <Grace n={t.amount} /> : fmtHours(t.amount)} on {fmtDate(t.createdAt)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
