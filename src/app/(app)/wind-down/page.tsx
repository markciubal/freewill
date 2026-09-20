import Link from "next/link";
import { Badge, Card, Grace, PageTitle, SectionTitle, Stat, fmtHours } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { windDownReport } from "@/lib/jubilee";
import { InfoDot } from "@/components/info-dot";


export default async function WindDownPage() {
  await requireUser();
  const r = await windDownReport();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle
        title="If the commons wound down"
        subtitle="A fail-safe you can check any day. Because this is mutual credit, dissolving costs no one: debts are forgiven, credits release, and everyone returns to zero together. The cost of failure is shared perfectly evenly, because it is zero for each person."
      />

      <Card className="grid gap-4 sm:grid-cols-3">
        <Stat label="Members" value={r.members} />
        <Stat label="Grace debt forgiven" value={<Grace n={r.graceDebtForgiven} />} sub="what debtors owed the whole" />
        <Stat label="Grace claims released" value={<Grace n={r.gracePositiveReleased} />} sub="promises creditors held" />
      </Card>

      <Card className="space-y-3">
        <SectionTitle>What happens on wind-down <InfoDot term="jubilee" /></SectionTitle>
        <ol className="space-y-2 text-sm">
          <li><span className="font-medium">1. Every balance returns to zero.</span> No one owes anyone. Nobody is chased for a debt, because the debt was to the community, and the community is releasing it.</li>
          <li><span className="font-medium">2. Unredeemed vouchers are void.</span> {r.outstandingVouchers > 0 ? <>The <Grace n={r.outstandingVouchers} /> reserved in notes returns to the issuers, then zeroes with everyone else.</> : "None are outstanding."}</li>
          <li><span className="font-medium">3. Shared resources stay put.</span> The {r.commons} commons remain with their stewards, or an assembly decides their future. They were never anyone&apos;s private wealth to divide.</li>
          <li><span className="font-medium">4. Open disputes close as no-fault.</span> {r.openDisputes > 0 ? `${r.openDisputes} open right now would be recorded and set down.` : "None are open."}</li>
        </ol>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center gap-2">
          <SectionTitle>The books balance</SectionTitle>
          <Badge tone={r.balances ? "accent" : "danger"}>{r.balances ? "net zero" : "off — investigate"}</Badge>
        </div>
        <p className="text-sm text-muted">
          Grace balances plus the {r.remainder} carried from demurrage plus the {r.outstandingVouchers} reserved in vouchers sum to zero.
          Hours (currently {fmtHours(r.hoursPositiveReleased)} of credit against {fmtHours(r.hoursDebtForgiven)} of debt) sum to zero on their own.
          There is no treasury to seize, so there is nothing a hostile authority can take by dissolving the commons.
        </p>
        <p className="text-sm text-muted">
          This page is a mirror, not a button. Winding down is something the people decide together in an{" "}
          <Link href="/assemblies" className="text-accent hover:underline">assembly</Link>, never a switch one person flips.
        </p>
      </Card>
    </div>
  );
}
