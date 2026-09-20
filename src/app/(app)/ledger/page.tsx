import Link from "next/link";
import { Card, Empty, Field, Grace, Input, Notice, PageTitle, SectionTitle, Select, Stat, fmtDate, fmtDateTime, fmtHours } from "@/components/ui";
import { GraceMark } from "@/components/grace-mark";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEMURRAGE_INTERVAL_DAYS, DEMURRAGE_RATE_MONTHLY, latestRun, maybeRunDemurrage } from "@/lib/demurrage";
import { fmtSigned, getPulse } from "@/lib/pulse";
import { ledgerRoot } from "@/lib/hashlog";
import { signCheckpoint } from "@/lib/checkpoint";
import { outstandingVouchers } from "@/lib/voucher";
import { TIER_LABEL } from "@/lib/standing";
import { getStanding } from "@/lib/standing.all";
import { getTrustPreview, trustFlags } from "@/lib/trust";
import { InfoDot } from "@/components/info-dot";

import { Badge } from "@/components/ui";
import { sendTransfer } from "./actions";

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; to?: string }> }) {
  const me0 = await requireUser();
  const sp = await searchParams;
  await maybeRunDemurrage();
  const preview = sp.to ? await getTrustPreview(sp.to) : null;
  const [me, standing, transfers, adjustments, totals, run, pulse] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: me0.id }, select: { graceBalance: true, hoursBalance: true } }),
    getStanding(me0.id),
    db.transfer.findMany({
      where: { OR: [{ fromId: me0.id }, { toId: me0.id }] },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { from: { select: { username: true } }, to: { select: { username: true } } },
    }),
    db.ledgerAdjustment.findMany({ where: { userId: me0.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.user.aggregate({ _sum: { graceBalance: true, hoursBalance: true }, _count: true }),
    latestRun(),
    getPulse(),
  ]);
  const [chain, outstanding, cashAgg] = await Promise.all([
    ledgerRoot(),
    outstandingVouchers(),
    db.cashNote.aggregate({ where: { status: "LOCKED" }, _sum: { denomination: true } }),
  ]);
  const outstandingCash = (cashAgg._sum.denomination ?? 0) * 100; // denominations are whole Grace; ledger is cents
  const checkpoint = await signCheckpoint();

  type Row = { id: string; at: Date; with: string | null; memo: string; ledger: "GRACE" | "HOURS"; amount: number };
  const rows: Row[] = [
    ...transfers.map((t) => ({ id: t.id, at: t.createdAt, with: t.fromId === me0.id ? t.to.username : t.from.username, memo: t.memo ?? "", ledger: t.ledger, amount: t.fromId === me0.id ? -t.amount : t.amount })),
    ...adjustments.map((a) => ({ id: a.id, at: a.createdAt, with: null, memo: a.reason === "DEMURRAGE" ? "Demurrage on positive balance" : "Dividend from demurrage", ledger: a.ledger, amount: a.amount })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const nextRun = run ? new Date(run.ranAt.getTime() + DEMURRAGE_INTERVAL_DAYS * 86_400_000) : null;

  return (
    <div className="space-y-8">
      <PageTitle title="Ledger" subtitle="Community credit with no bank behind it. Grace prices things by value; Hours count everyone's time equally. Both are created by giving and settled by giving back." />
      <Notice error={sp.error} ok={sp.ok} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><Stat label={<>Grace <InfoDot term="grace" /></>} value={<Grace n={me.graceBalance} />} sub={<>limit <Grace n={-standing.graceLimit} /></>} /></Card>
        <Card><Stat label={<>Hours <InfoDot term="hours" /></>} value={fmtHours(me.hoursBalance)} sub={`limit -${fmtHours(standing.hoursLimit)}`} /></Card>
        <Card><Stat label={<>Standing <InfoDot term="standing" /></>} value={TIER_LABEL[standing.tier]} sub={standing.verified ? `${standing.score} pts, verified` : `not verified: ${standing.requiredVouches} vouches needed`} /></Card>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <SectionTitle>Pay someone</SectionTitle>
          <form method="get" className="mb-3 flex items-end gap-2">
            <div className="flex-1"><Field label="Check before you pay" hint="See what they already owe the commons."><Input name="to" defaultValue={sp.to ?? ""} placeholder="@neighbor" /></Field></div>
            <SubmitButton variant="ghost">Look up</SubmitButton>
          </form>

          {sp.to && !preview && <p className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">No one here is called @{sp.to.replace(/^@/, "")}.</p>}
          {preview && (
            <div className="mb-4 rounded-md border border-border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/people/${preview.username}`} className="font-medium hover:underline">@{preview.username}</Link>
                <span className="text-xs text-muted">{TIER_LABEL[preview.tier as keyof typeof TIER_LABEL] ?? preview.tier} · {preview.locality}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-xs text-muted">Grace balance</span><div className={preview.graceBalance < 0 ? "text-danger" : ""}><Grace n={preview.graceBalance} /></div></div>
                <div><span className="text-xs text-muted">Owe-limit</span><div className="text-muted"><Grace n={-preview.graceLimit} /></div></div>
                <div><span className="text-xs text-muted">Kept pledges</span><div>{preview.pledgesKept}{preview.openPledges > 0 ? ` (+${preview.openPledges} open)` : ""}</div></div>
                <div><span className="text-xs text-muted">Vouches</span><div>{preview.vouchesReceived}</div></div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {trustFlags(preview).map((f, i) => <Badge key={i} tone={f.tone}>{f.text}</Badge>)}
              </div>
            </div>
          )}

          <form action={sendTransfer} className="space-y-3">
            <Field label="To (username)"><Input name="to" required placeholder="@neighbor" defaultValue={preview?.username ? `@${preview.username}` : sp.to ?? ""} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ledger">
                <Select name="ledger" defaultValue="GRACE"><option value="GRACE">Grace</option><option value="HOURS">Hours</option></Select>
              </Field>
              <Field label="Amount" hint="Grace to two decimals, or decimal hours."><Input name="amount" type="number" min={0.01} step={0.01} required /></Field>
            </div>
            <Field label="For (optional)"><Input name="memo" maxLength={200} placeholder="Two loaves and the ride" /></Field>
            <SubmitButton pendingText="Sending...">Send</SubmitButton>
          </form>
        </Card>

        <Card>
          <SectionTitle>How this works</SectionTitle>
          <ul className="space-y-2 text-sm text-muted">
            <li><GraceMark size="1.6em" className="text-accent" /> is the symbol for Grace, the way $ marks a dollar: an olive sprig. In plain text write GRC.</li>
            <li>Paying someone lowers your balance and raises theirs by the same amount. There is no mint and no bank.</li>
            <li>A negative balance is not debt to any one person; it just means the community has given you more than you have given back so far. Standing sets how far below zero you can go; unverified accounts cannot go below zero.</li>
            <li><InfoDot term="demurrage" /> Positive Grace shrinks {Math.round(DEMURRAGE_RATE_MONTHLY * 100)}% every {DEMURRAGE_INTERVAL_DAYS} days, and the amount is paid out equally to every verified member. This keeps credit circulating instead of piling up. {run && run.days > 0 ? `Last run ${fmtDate(run.ranAt)}: ${run.totalDecayed} GRC shared among ${run.members}.` : ""} {nextRun ? `Next: ${fmtDate(nextRun)}.` : ""}</li>
            <li>Across all {totals._count} people, Grace balances sum to {totals._sum.graceBalance ?? 0}; add {run?.remainder ?? 0} carried from demurrage, {outstanding} reserved in unredeemed vouchers, and {outstandingCash} locked in unspent cash notes, and the total is zero, or something is wrong.</li>
            <li>Hours are for work that should not be haggled over: care, watch shifts, teaching. One hour counts the same for everyone.</li>
            <li>
              <InfoDot term="checkpoint" /> Every entry is hash-chained. The whole history fingerprints to one root, so any later edit is evident.
              <span className="mt-1 block font-mono text-xs">{chain.count} entries · root {chain.root.slice(0, 16)}…</span>
            </li>
          </ul>
          <div className="mt-4 rounded-md border border-border p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">Signed checkpoint</div>
            <p className="mt-1 text-sm text-muted">
              The commons has signed this root. Download the ledger and verify it on any machine, or keep this root to prove the past later.
            </p>
            <p className="mt-1 break-all font-mono text-[11px]">root {checkpoint.root.slice(0, 32)}… · {checkpoint.count} entries · signed {checkpoint.at.slice(0, 10)}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <a href="/api/ledger/export" className="text-accent hover:underline" download>Download signed ledger</a>
              <Link href="/verify" className="text-accent hover:underline">Verify a ledger</Link>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle>Trade pulse</SectionTitle>
        <p className="text-sm text-muted">
          The ledger sums to zero by design. Wellbeing does not: after each settled exchange, both people are asked
          whether it left them better off.
        </p>
        {pulse.allTime.answers === 0 ? (
          <p className="mt-2 text-sm text-muted">No answers yet. Settle an exchange and you will be asked.</p>
        ) : (
          <p className="mt-2 text-sm">
            All time: <span className="font-semibold tabular-nums">{fmtSigned(pulse.allTime.sum)}</span> across{" "}
            {pulse.allTime.answers} answer{pulse.allTime.answers === 1 ? "" : "s"}. Last 30 days:{" "}
            <span className="font-semibold tabular-nums">{fmtSigned(pulse.last30.sum)}</span> from{" "}
            {pulse.last30.answers} answer{pulse.last30.answers === 1 ? "" : "s"} on {pulse.last30.settled} settled
            exchange{pulse.last30.settled === 1 ? "" : "s"}.
          </p>
        )}
      </Card>

      <section>
        <SectionTitle>History</SectionTitle>
        {rows.length === 0 ? (
          <Empty>No transfers yet.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted">
                <tr><th className="p-3">When</th><th className="p-3">With</th><th className="p-3">For</th><th className="p-3 text-right">Amount</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-3 text-muted">{fmtDateTime(r.at)}</td>
                    <td className="p-3">{r.with ? <Link href={`/people/${r.with}`} className="hover:underline">@{r.with}</Link> : <span className="text-muted">everyone</span>}</td>
                    <td className="p-3 text-muted">{r.memo}</td>
                    <td className={`p-3 text-right tabular-nums ${r.amount < 0 ? "text-danger" : "text-accent"}`}>{r.amount < 0 ? "-" : "+"}{r.ledger === "GRACE" ? <Grace n={Math.abs(r.amount)} /> : fmtHours(Math.abs(r.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
