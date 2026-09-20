import Link from "next/link";
import { WorkedSteps } from "@/components/worked-steps";
import { PageTitle, fmtDateTime } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { explainKeeperPool, explainLatestDemurrage, explainStanding, explainZeroSum, zeroSumParts } from "@/lib/explain";

// "Show the work." Every number the app decides about you, and the two
// numbers the whole ledger rests on, walked through step by step with the
// real inputs. The steps are produced by the same code that makes the
// decision, so if the page and the decision ever disagreed, the code would
// have to disagree with itself.

export default async function ExplainPage() {
  const me = await requireUser();
  const [standing, demurrage, zeroSum] = await Promise.all([explainStanding(me.id), explainLatestDemurrage(), zeroSumParts().then(explainZeroSum)]);
  const keeperPool = explainKeeperPool(standing.input.localityPopulation);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle
        title="Show the work"
        subtitle="Nothing here is decided by a person. Every rule is arithmetic anyone can redo. This page shows that arithmetic with your real numbers in it, produced by the same code that applies the rule, so you can check the app against the ground rules yourself."
      />

      <WorkedSteps worked={standing} tone="accent" />

      <WorkedSteps worked={keeperPool} />

      {demurrage ? (
        <div className="space-y-2">
          <WorkedSteps worked={demurrage.worked} tone={demurrage.matchesRecord ? "accent" : "danger"} />
          <p className="text-xs text-muted">
            Run recorded {fmtDateTime(demurrage.run.ranAt)} over {demurrage.run.days} days at {Math.round(demurrage.run.rateMonthly * 100)}% a month.{" "}
            {demurrage.matchesRecord
              ? "Re-deriving the share and the carry from the recorded totals gives exactly what was recorded."
              : "Re-deriving the share and the carry from the recorded totals does NOT give what was recorded. Something changed the record after the fact; check the ledger."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">Demurrage has not run yet; the first run only sets the baseline.</p>
      )}

      <WorkedSteps worked={zeroSum} tone={zeroSum.balances ? "accent" : "danger"} />

      <p className="text-xs text-muted">
        Want to go further? <Link href="/verify" className="text-accent hover:underline">Verify the ledger</Link> re-derives the whole hash chain, and{" "}
        <Link href="/sabul" className="text-accent hover:underline">the critic</Link> asks where these rules are under strain. The source files named on each card are in the public repository; the rule text above is generated from the same constants the code uses.
      </p>
    </div>
  );
}
