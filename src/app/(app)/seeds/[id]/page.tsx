import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, Empty, Field, Notice, PageTitle, SectionTitle, Textarea, fmtDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isObjectId } from "@/lib/form";
import { fmtDistance, haversineKm } from "@/lib/geo";
import { SEED_CATEGORY_LABEL, SEED_FORM_LABEL, SEED_REQUEST_LABEL, formatSowMonths } from "@/lib/seeds";
import { markReturned, requestSeeds, respondToSeedRequest, toggleSeedShare } from "../actions";

export default async function SeedSharePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!isObjectId(id)) notFound();
  const s = await db.seedShare.findUnique({
    where: { id },
    include: {
      steward: { select: { username: true, displayName: true } },
      requests: { orderBy: { createdAt: "asc" }, include: { user: { select: { username: true } } } },
    },
  });
  if (!s) notFound();

  const mine = s.stewardId === me.id;
  const myRequest = s.requests.find((r) => r.userId === me.id && (r.status === "REQUESTED" || r.status === "GIVEN"));
  const returned = s.requests.filter((r) => r.status === "RETURNED").length;
  const growing = s.requests.filter((r) => r.status === "GIVEN").length;
  const distance = s.lat !== null && s.lng !== null && !mine ? fmtDistance(haversineKm(me, { lat: s.lat, lng: s.lng })) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle
        title={s.name}
        subtitle={`${SEED_FORM_LABEL[s.form]} from @${s.steward.username}, shared ${fmtDate(s.createdAt)}`}
        action={<Link href="/seeds" className="text-sm text-accent hover:underline">Back to the bank</Link>}
      />
      <Notice error={sp.error} ok={sp.ok} />

      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">{SEED_FORM_LABEL[s.form]}</Badge>
          <Badge>{SEED_CATEGORY_LABEL[s.category]}</Badge>
          {s.openPollinated === true && <Badge tone="accent">open-pollinated</Badge>}
          {s.openPollinated === false && <Badge tone="warn">hybrid</Badge>}
          <Badge tone={s.available ? "accent" : "danger"}>{s.available ? "available" : "paused"}</Badge>
        </div>
        <p className="whitespace-pre-wrap text-sm">{s.description}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted">Sow</dt><dd>{formatSowMonths(s.sowMonths)}</dd></div>
          {s.daysToMaturity && <div><dt className="text-xs text-muted">Days to maturity</dt><dd>{s.daysToMaturity}</dd></div>}
          {s.quantity && <div><dt className="text-xs text-muted">On hand</dt><dd>{s.quantity}</dd></div>}
          {s.yearSaved && <div><dt className="text-xs text-muted">Year saved</dt><dd>{s.yearSaved}</dd></div>}
          {s.locality && <div><dt className="text-xs text-muted">Where</dt><dd>{s.locality}{distance ? ` / ${distance} away` : ""}</dd></div>}
          <div><dt className="text-xs text-muted">Returned to bank</dt><dd>{returned} time{returned === 1 ? "" : "s"}</dd></div>
        </dl>
        {mine && (
          <form action={toggleSeedShare.bind(null, s.id)}>
            <Button variant="ghost" type="submit">{s.available ? "Pause sharing" : "Resume sharing"}</Button>
          </form>
        )}
      </Card>

      {!mine && s.available && !myRequest && (
        <Card>
          <SectionTitle>Ask for some</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            Gift-first: take what you will actually plant. The custom is to bring seed back at harvest so the bank grows, more than you took if the season was kind.
          </p>
          <form action={requestSeeds.bind(null, s.id)} className="space-y-3">
            <Field label="A note (optional)" hint="How much you need, where you'll grow it.">
              <Textarea name="message" rows={2} maxLength={500} />
            </Field>
            <SubmitButton pendingText="Asking...">Request</SubmitButton>
          </form>
        </Card>
      )}

      {myRequest && (
        <Card className="space-y-2">
          <SectionTitle>Your request</SectionTitle>
          <Badge tone={myRequest.status === "GIVEN" ? "accent" : "neutral"}>{SEED_REQUEST_LABEL[myRequest.status]}</Badge>
          {myRequest.status === "GIVEN" && (
            <form action={markReturned.bind(null, myRequest.id)}>
              <SubmitButton pendingText="Recording...">I returned seed at harvest</SubmitButton>
            </form>
          )}
        </Card>
      )}

      <section>
        <SectionTitle>Requests {growing > 0 && <span className="text-muted">· {growing} growing</span>}</SectionTitle>
        {s.requests.length === 0 ? (
          <Empty>No requests yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {s.requests.map((r) => (
              <li key={r.id}>
                <Card className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/people/${r.user.username}`} className="font-medium hover:underline">@{r.user.username}</Link>
                    <Badge tone={r.status === "RETURNED" ? "accent" : r.status === "DECLINED" ? "danger" : "neutral"}>{SEED_REQUEST_LABEL[r.status]}</Badge>
                    <span className="text-xs text-muted">{fmtDate(r.createdAt)}</span>
                  </div>
                  {r.message && <p className="text-sm text-muted">{r.message}</p>}
                  <div className="flex flex-wrap gap-2">
                    {mine && r.status === "REQUESTED" && (
                      <>
                        <form action={respondToSeedRequest.bind(null, r.id, "GIVEN")}><Button type="submit">Give seed</Button></form>
                        <form action={respondToSeedRequest.bind(null, r.id, "DECLINED")}><Button variant="ghost" type="submit">Decline</Button></form>
                      </>
                    )}
                    {(mine || r.userId === me.id) && r.status === "GIVEN" && (
                      <form action={markReturned.bind(null, r.id)}><Button type="submit">Mark returned</Button></form>
                    )}
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
