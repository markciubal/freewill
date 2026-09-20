import QRCode from "qrcode";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, Grace, Notice, PageTitle, fmtDateTime, fmtHours } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isObjectId } from "@/lib/form";
import { commonsPublicKeyHex, encodeNote } from "@/lib/voucher";
import { voidVoucher } from "../actions";

export default async function VoucherPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!isObjectId(id)) notFound();
  const v = await db.voucher.findUnique({ where: { id }, include: { issuer: { select: { username: true } }, redeemer: { select: { username: true } } } });
  if (!v) notFound();

  const note = encodeNote({ issuerId: v.issuerId, issuerName: v.issuer.username, ledger: v.ledger, amount: v.amount, nonce: v.nonce, sig: v.signature });
  const qr = await QRCode.toString(note, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const pubKey = commonsPublicKeyHex();
  const mineUnredeemed = v.issuerId === me.id && v.status === "ISSUED";
  const amount = v.ledger === "GRACE" ? <Grace n={v.amount} /> : <span>{fmtHours(v.amount)}</span>;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageTitle
        title="Bearer note"
        subtitle={`Minted by @${v.issuer.username} · ${fmtDateTime(v.createdAt)}`}
        action={<Link href="/vouchers" className="text-sm text-accent hover:underline">All notes</Link>}
      />
      <Notice error={sp.error} />

      {/* The note itself: print this. */}
      <div className="rounded-xl border-2 border-accent bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted">Freewill bearer note</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">{amount}</div>
            <div className="text-sm text-muted">from @{v.issuer.username}{v.memo ? ` · ${v.memo}` : ""}</div>
          </div>
          <Badge tone={v.status === "ISSUED" ? "warn" : v.status === "REDEEMED" ? "accent" : "neutral"}>{v.status.toLowerCase()}</Badge>
        </div>

        <div className="mt-4 flex flex-col items-center gap-3">
          <div className="h-44 w-44 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="w-full break-all rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-relaxed">{note}</div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div><dt className="text-muted">Serial (nonce)</dt><dd className="font-mono">{v.nonce}</dd></div>
          <div><dt className="text-muted">Signed by commons key</dt><dd className="font-mono break-all">{pubKey.slice(0, 24)}…</dd></div>
        </dl>
        {v.status === "REDEEMED" && v.redeemer && (
          <p className="mt-3 text-sm text-accent">Redeemed by @{v.redeemer.username}{v.redeemedAt ? ` on ${fmtDateTime(v.redeemedAt)}` : ""}.</p>
        )}
      </div>

      <Card className="space-y-2 text-sm text-muted">
        <p className="font-medium text-foreground">How to trust this note</p>
        <p>Anyone can verify the signature against the commons public key without asking a server. The serial is single-use: the first person to redeem it is credited, and any copy presented afterward is refused. So a photocopy cannot spend twice, though it can be attempted once and caught.</p>
        <p className="break-all font-mono text-[11px]">commons key: {pubKey}</p>
      </Card>

      {mineUnredeemed && (
        <form action={voidVoucher.bind(null, v.id)}>
          <Button variant="danger" type="submit">Void this note (refund me {v.ledger === "GRACE" ? "the Grace" : "the hours"})</Button>
        </form>
      )}
    </div>
  );
}
