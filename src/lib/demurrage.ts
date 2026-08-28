import { db } from "./db";
import { getStandingAll } from "./standing.all";

// Demurrage: positive Grace decays a little every month, and what decays is
// paid out equally to every verified member. Hoarding funds everyone. The
// rounding remainder is carried into the next run so the ledger stays zero-sum:
//   sum(user.graceBalance) + latestRun.remainder == 0

export const DEMURRAGE_RATE_MONTHLY = 0.03;
export const DEMURRAGE_INTERVAL_DAYS = 30;

export async function latestRun() {
  return db.demurrageRun.findFirst({ orderBy: { ranAt: "desc" } });
}

// Runs at most once per interval. Call it from anywhere the ledger is touched;
// it is cheap when there is nothing to do. `force` runs it now for `days`.
export async function maybeRunDemurrage(opts: { force?: boolean; days?: number } = {}) {
  const last = await latestRun();
  if (!last) {
    // First run is a baseline: nothing decays before people know the rule.
    return db.demurrageRun.create({ data: { days: 0, rateMonthly: DEMURRAGE_RATE_MONTHLY, totalDecayed: 0, members: 0, dividend: 0, remainder: 0 } });
  }
  const elapsedDays = Math.floor((Date.now() - last.ranAt.getTime()) / 86_400_000);
  const days = opts.force ? (opts.days ?? DEMURRAGE_INTERVAL_DAYS) : elapsedDays;
  if (!opts.force && elapsedDays < DEMURRAGE_INTERVAL_DAYS) return null;

  const standings = await getStandingAll();
  const verified = [...standings.values()].filter((s) => s.verified).map((s) => s.user.id);
  const holders = await db.user.findMany({ where: { graceBalance: { gt: 0 } }, select: { id: true, graceBalance: true } });

  const decays = holders
    .map((h) => ({ id: h.id, amount: Math.floor(h.graceBalance * DEMURRAGE_RATE_MONTHLY * (days / 30)) }))
    .filter((d) => d.amount > 0);
  const totalDecayed = decays.reduce((a, d) => a + d.amount, 0);
  const pot = totalDecayed + last.remainder;
  const members = verified.length;
  const dividend = members ? Math.floor(pot / members) : 0;
  const remainder = pot - dividend * members;

  return db.$transaction(async (tx) => {
    const run = await tx.demurrageRun.create({
      data: { days, rateMonthly: DEMURRAGE_RATE_MONTHLY, totalDecayed, members, dividend, remainder },
    });
    for (const d of decays) {
      await tx.user.update({ where: { id: d.id }, data: { graceBalance: { decrement: d.amount } } });
      await tx.ledgerAdjustment.create({ data: { userId: d.id, ledger: "GRACE", amount: -d.amount, reason: "DEMURRAGE", runId: run.id } });
    }
    if (dividend > 0) {
      for (const id of verified) {
        await tx.user.update({ where: { id }, data: { graceBalance: { increment: dividend } } });
        await tx.ledgerAdjustment.create({ data: { userId: id, ledger: "GRACE", amount: dividend, reason: "DIVIDEND", runId: run.id } });
      }
    }
    return run;
  }, { timeout: 60_000 });
}
