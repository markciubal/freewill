import Link from "next/link";
import { Badge, Card, Empty, Field, Grace, LinkButton, Notice, PageTitle, SectionTitle, Textarea, fmtDate, fmtHours } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redeemVoucher } from "./actions";

const STATUS_TONE = { ISSUED: "warn", REDEEMED: "accent", VOIDED: "neutral" } as const;

export default async function VouchersPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const mine = await db.voucher.findMany({
    where: { issuerId: me.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { redeemer: { select: { username: true } } },
  });

  return (
    <div className="space-y-8">
      <PageTitle
        title="Vouchers (retired)"
        subtitle="Vouchers were commons-signed notes. They have been replaced by Cash, which you hold yourself: your device makes and keeps the secret, so the commons can never spend a note for you. Any voucher already minted can still be redeemed or voided below, so nothing is stranded."
      />
      <Notice error={sp.error} ok={sp.ok} />

      <Card className="border-accent/60">
        <SectionTitle>Use Cash instead</SectionTitle>
        <p className="mb-3 text-sm text-muted">Cash notes are more self-custodial and work the same way offline. New notes are minted there.</p>
        <LinkButton href="/cash">Go to Cash</LinkButton>
      </Card>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <SectionTitle>Redeem an existing note</SectionTitle>
          <form action={redeemVoucher} className="space-y-3">
            <Field label="Paste the note's code" hint="Starts with FWV1. From the printed note or a scan.">
              <Textarea name="token" rows={4} required placeholder="FWV1...." className="font-mono text-xs" />
            </Field>
            <SubmitButton pendingText="Checking...">Redeem</SubmitButton>
          </form>
          <p className="mt-3 text-xs text-muted">The signature is checked before anything moves. A note already spent or voided is refused.</p>
        </Card>
      </div>

      <section>
        <SectionTitle>Notes you minted</SectionTitle>
        {mine.length === 0 ? (
          <Empty>You have not minted any notes.</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {mine.map((v) => (
              <li key={v.id}>
                <Link href={`/vouchers/${v.id}`} className="block rounded-lg border border-border bg-card p-3 hover:border-accent">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{v.ledger === "GRACE" ? <Grace n={v.amount} /> : fmtHours(v.amount)}</span>
                    <Badge tone={STATUS_TONE[v.status]}>{v.status.toLowerCase()}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {v.memo ? `${v.memo} · ` : ""}{fmtDate(v.createdAt)}
                    {v.redeemer ? ` · redeemed by @${v.redeemer.username}` : ""}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
