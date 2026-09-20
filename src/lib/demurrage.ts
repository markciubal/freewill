import { db } from "./db";
import { appendLog } from "./hashlog";
import { getStandingAll } from "./standing.all";

// Demurrage: positive Grace decays a little every month, and what decays is
// paid out equally to every verified member. Hoarding funds everyone. The
// rounding remainder is carried into the next run so the ledger stays zero-sum:
//   sum(user.graceBalance) + latestRun.remainder == 0
//
// The process, in order:
//   1. Find out how long since the last run. Under 30 days: do nothing.
//   2. For every positive balance, work out the melt: floor(balance × rate × days/30).
//   3. Add up the melt plus the cents carried from last time: that is the pot.
//   4. Divide the pot equally among verified members; the cents that do not
//      divide are carried to the next run.
//   5. In one transaction: record the run, debit each melted balance, credit
//      each dividend, and append every adjustment to the hash chain.
// "Show the work" (/explain) re-derives steps 3 and 4 from the recorded run.

export const DEMURRAGE_RATE_MONTHLY = 0.03;
export const DEMURRAGE_INTERVAL_DAYS = 30;

const MILLISECONDS_PER_DAY = 86_400_000;

export async function latestRun() {
  return db.demurrageRun.findFirst({ orderBy: { ranAt: "desc" } });
}

// The melt on one balance for one run. Pure, so the rule is checkable.
export function decayFor(positiveBalanceCents: number, days: number, rateMonthly = DEMURRAGE_RATE_MONTHLY): number {
  return Math.floor(positiveBalanceCents * rateMonthly * (days / DEMURRAGE_INTERVAL_DAYS));
}

// Runs at most once per interval. Call it from anywhere the ledger is touched;
// it is cheap when there is nothing to do. `force` runs it now for `days`.
export async function maybeRunDemurrage(options: { force?: boolean; days?: number } = {}) {
  const previousRun = await latestRun();
  if (!previousRun) {
    // First run is a baseline: nothing decays before people know the rule.
    return db.demurrageRun.create({ data: { days: 0, rateMonthly: DEMURRAGE_RATE_MONTHLY, totalDecayed: 0, members: 0, dividend: 0, remainder: 0 } });
  }

  // Step 1: is it time?
  const daysSincePreviousRun = Math.floor((Date.now() - previousRun.ranAt.getTime()) / MILLISECONDS_PER_DAY);
  const daysThisRunCovers = options.force ? (options.days ?? DEMURRAGE_INTERVAL_DAYS) : daysSincePreviousRun;
  if (!options.force && daysSincePreviousRun < DEMURRAGE_INTERVAL_DAYS) return null;

  // Step 2: who melts, and by how much.
  const standings = await getStandingAll();
  const verifiedMemberIds = [...standings.values()].filter((standing) => standing.verified).map((standing) => standing.user.id);
  const positiveHolders = await db.user.findMany({ where: { graceBalance: { gt: 0 } }, select: { id: true, graceBalance: true } });
  const decays = positiveHolders
    .map((holder) => ({ userId: holder.id, amountCents: decayFor(holder.graceBalance, daysThisRunCovers) }))
    .filter((decay) => decay.amountCents > 0);

  // Steps 3 and 4: the pot and its equal division.
  const totalDecayed = decays.reduce((sum, decay) => sum + decay.amountCents, 0);
  const pot = totalDecayed + previousRun.remainder;
  const verifiedMemberCount = verifiedMemberIds.length;
  const dividendPerMember = verifiedMemberCount ? Math.floor(pot / verifiedMemberCount) : 0;
  const remainderCarriedForward = pot - dividendPerMember * verifiedMemberCount;

  // Step 5: write it all down together, or not at all.
  return db.$transaction(async (tx) => {
    const run = await tx.demurrageRun.create({
      data: { days: daysThisRunCovers, rateMonthly: DEMURRAGE_RATE_MONTHLY, totalDecayed, members: verifiedMemberCount, dividend: dividendPerMember, remainder: remainderCarriedForward },
    });
    for (const decay of decays) {
      await tx.user.update({ where: { id: decay.userId }, data: { graceBalance: { decrement: decay.amountCents } } });
      const adjustment = await tx.ledgerAdjustment.create({ data: { userId: decay.userId, ledger: "GRACE", amount: -decay.amountCents, reason: "DEMURRAGE", runId: run.id } });
      await appendLog(tx, "ADJUSTMENT", adjustment.id, adjustment as unknown as Record<string, unknown>);
    }
    if (dividendPerMember > 0) {
      for (const memberId of verifiedMemberIds) {
        await tx.user.update({ where: { id: memberId }, data: { graceBalance: { increment: dividendPerMember } } });
        const adjustment = await tx.ledgerAdjustment.create({ data: { userId: memberId, ledger: "GRACE", amount: dividendPerMember, reason: "DIVIDEND", runId: run.id } });
        await appendLog(tx, "ADJUSTMENT", adjustment.id, adjustment as unknown as Record<string, unknown>);
      }
    }
    return run;
  }, { timeout: 60_000 });
}
