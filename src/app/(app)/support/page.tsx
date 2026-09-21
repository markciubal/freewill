import { Card, LinkButton, PageTitle, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";

// Funding the infrastructure, kept strictly apart from the credit system. This
// is a tip jar for the server bill, not a way to buy Grace. Grace is mutual
// credit: it is earned by helping someone, never purchased, or it stops meaning
// what it means. Money given here keeps the lights on and buys no one standing,
// credit, or influence.

export default async function SupportPage() {
  await requireUser();
  const url = process.env.SUPPORT_URL?.trim();
  const note = process.env.SUPPORT_NOTE?.trim() || "Hosting, the database, and the map tiles.";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle
        title="Support the server"
        subtitle="Running this costs a little real money. If you can chip in, it helps. This is separate from Grace in every way."
      />

      <Card className="space-y-3">
        <SectionTitle>What your money does and does not do</SectionTitle>
        <ul className="space-y-2 text-sm text-muted">
          <li><span className="font-medium text-foreground">Does:</span> pay for running the server.</li>
          <li><span className="font-medium text-foreground">What that covers here:</span> {note}</li>
          <li><span className="font-medium text-foreground">Does not:</span> buy you Grace, Hours, standing, credit, a vote, or any advantage. There is no way to purchase those, on purpose.</li>
          <li>No cut is taken from anyone&apos;s trades. There is no fee on the credit system, and there is no treasury holding value that could be seized.</li>
        </ul>
        {url ? (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <LinkButton href={url}>Chip in for the server</LinkButton>
            <span className="text-xs text-muted">Opens the donation page in a new place.</span>
          </div>
        ) : (
          <p className="rounded-md border border-border bg-background p-3 text-sm text-muted">
            No donation link is set for this instance. If you run it, set <span className="font-mono text-xs">SUPPORT_URL</span> to a donation
            page (Open Collective, Ko-fi, GitHub Sponsors, a plain Stripe donation link). Better yet, host your own node — then the only bill is yours.
          </p>
        )}
      </Card>

      <Card className="space-y-2 text-sm text-muted">
        <p className="font-medium text-foreground">Why not just sell Grace?</p>
        <p>Because the moment Grace can be bought, money buys influence, a reserve has to back it, and that reserve becomes a treasury a hostile authority can freeze — the three things this whole design exists to avoid. Keeping the server tip jar and the credit system completely separate is what lets Grace stay trustworthy.</p>
      </Card>
    </div>
  );
}
