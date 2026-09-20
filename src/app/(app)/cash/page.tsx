import { Badge, Card, Empty, Field, Grace, Notice, PageTitle, SectionTitle, Stat, Textarea, fmtDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { MintCash } from "@/components/mint-cash";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStanding } from "@/lib/standing.all";
import { redeemCash } from "./actions";

export default async function CashPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const [meBal, standing, mine, outstanding] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: me.id }, select: { graceBalance: true } }),
    getStanding(me.id),
    db.cashNote.findMany({ where: { minterId: me.id }, orderBy: { createdAt: "desc" }, take: 100, include: { spender: { select: { username: true } } } }),
    db.cashNote.aggregate({ where: { status: "LOCKED" }, _sum: { denomination: true } }),
  ]);
  const locked = mine.filter((n) => n.status === "LOCKED").reduce((s, n) => s + n.denomination, 0);

  return (
    <div className="space-y-8">
      <PageTitle
        title="Cash"
        subtitle="Bearer notes locked by a secret only you hold. Your device makes the secret and hashes it; the commons stores only the hash, so it can never spend a note for you. Write the note down, hand it over, and whoever reveals the secret reclaims the value. Lose the paper and it is gone, like cash."
      />
      <Notice error={sp.error} ok={sp.ok} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><Stat label="Grace" value={<Grace n={meBal.graceBalance} />} sub={<>limit <Grace n={-standing.graceLimit} /></>} /></Card>
        <Card><Stat label="Locked in your notes" value={<Grace n={locked} />} sub="reclaimable with the secret" /></Card>
        <Card><Stat label="All unspent notes" value={<Grace n={outstanding._sum.denomination ?? 0} />} sub="across the commons" /></Card>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card><MintCash /></Card>

        <Card>
          <SectionTitle>Reclaim a note</SectionTitle>
          <form action={redeemCash} className="space-y-3">
            <Field label="The note (denomination and secret)" hint="Looks like N1.10.<secret>. From the paper or a scan.">
              <Textarea name="token" rows={4} required placeholder="N1.10...." className="font-mono text-xs" />
            </Field>
            <SubmitButton pendingText="Checking...">Reclaim</SubmitButton>
          </form>
          <p className="mt-3 text-xs text-muted">Anyone holding the note can reclaim it, including you. The first valid reveal wins; a copy shown afterward is refused.</p>
        </Card>
      </div>

      <section>
        <SectionTitle>Notes you minted</SectionTitle>
        {mine.length === 0 ? (
          <Empty>You have not minted any cash notes.</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((n) => (
              <li key={n.id}>
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium tabular-nums"><Grace n={n.denomination} /></span>
                    <Badge tone={n.status === "LOCKED" ? "warn" : "accent"}>{n.status === "LOCKED" ? "unspent" : "reclaimed"}</Badge>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted">#{n.commitment.slice(0, 12)}…</div>
                  <div className="mt-1 text-xs text-muted">
                    {fmtDate(n.createdAt)}{n.spender ? ` · by @${n.spender.username}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
