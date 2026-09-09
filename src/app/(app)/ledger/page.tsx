import Link from "next/link";
import { Card, Empty, Field, Grace, Input, Notice, PageTitle, SectionTitle, Select, Stat, fmtDate, fmtDateTime, fmtHours } from "@/components/ui";
import { GraceMark } from "@/components/grace-mark";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEMURRAGE_INTERVAL_DAYS, DEMURRAGE_RATE_MONTHLY, latestRun, maybeRunDemurrage } from "@/lib/demurrage";
import { TIER_LABEL } from "@/lib/standing";
import { getStanding } from "@/lib/standing.all";
import { sendTransfer } from "./actions";

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me0 = await requireUser();
  const sp = await searchParams;
  await maybeRunDemurrage();
  const [me, standing, transfers, adjustments, totals, run] = await Promise.all([
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
  ]);

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
        <Card><Stat label="Grace" value={<Grace n={me.graceBalance} />} sub={<>limit <Grace n={-standing.graceLimit} /></>} /></Card>
        <Card><Stat label="Hours" value={fmtHours(me.hoursBalance)} sub={`limit -${fmtHours(standing.hoursLimit)}`} /></Card>
        <Card><Stat label="Standing" value={TIER_LABEL[standing.tier]} sub={standing.verified ? `${standing.score} pts, verified` : `not verified: ${standing.requiredVouches} vouches needed`} /></Card>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <SectionTitle>Pay someone</SectionTitle>
          <form action={sendTransfer} className="space-y-3">
            <Field label="To (username)"><Input name="to" required placeholder="@neighbor" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ledger">
                <Select name="ledger" defaultValue="GRACE"><option value="GRACE">Grace</option><option value="HOURS">Hours</option></Select>
              </Field>
              <Field label="Amount" hint="GRC units, or decimal hours."><Input name="amount" type="number" min={0.25} step={0.25} required /></Field>
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
            <li>Positive Grace shrinks {Math.round(DEMURRAGE_RATE_MONTHLY * 100)}% every {DEMURRAGE_INTERVAL_DAYS} days, and the amount is paid out equally to every verified member. This keeps credit circulating instead of piling up. {run && run.days > 0 ? `Last run ${fmtDate(run.ranAt)}: ${run.totalDecayed} GRC shared among ${run.members}.` : ""} {nextRun ? `Next: ${fmtDate(nextRun)}.` : ""}</li>
            <li>Across all {totals._count} people, Grace sums to {(totals._sum.graceBalance ?? 0) + (run?.remainder ?? 0)} (including {run?.remainder ?? 0} carried) and Hours to {totals._sum.hoursBalance ?? 0}. Always zero, or something is wrong.</li>
            <li>Hours are for work that should not be haggled over: care, watch shifts, teaching. One hour counts the same for everyone.</li>
          </ul>
        </Card>
      </div>

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
