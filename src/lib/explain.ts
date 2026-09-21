import { db } from "./db";
import { denominationCents } from "./cash";
import { DEMURRAGE_RATE_MONTHLY } from "./demurrage";
import { keeperPoolSize } from "./keepers";
import { computeStandingWithWork, type StandingInput } from "./standing";
import { getStandingInputs } from "./standing.all";
import { Work, fmtCentsForWork, type Worked } from "./worked";

// The worked explanations behind the app's claims, for the "Show the work"
// page. Each one gathers the live inputs, runs the same rule the app runs,
// and returns the steps. Nothing here decides anything; it repeats, in the
// open, what the deciding code did.

// --- Your standing -----------------------------------------------------------

export async function explainStanding(userId: string): Promise<Worked & { input: StandingInput }> {
  const inputs = await getStandingInputs();
  const input = inputs.get(userId);
  if (!input) throw new Error("No such person.");
  const { standing, work } = computeStandingWithWork(input);
  return {
    title: "Your standing",
    source: "src/lib/standing.ts",
    steps: work,
    result: `${standing.score} points, ${standing.tier}, ${standing.verified ? "verified" : "not verified"}`,
    input,
  };
}

// --- The last demurrage run --------------------------------------------------

export type DemurrageRunLike = { ranAt: Date; days: number; rateMonthly: number; totalDecayed: number; members: number; dividend: number; remainder: number };

// Re-derives the dividend and remainder of a run from its recorded totals and
// the remainder carried in from the run before it. Pure, so it is testable
// against every run in the database.
export function explainDemurrageRun(run: DemurrageRunLike, carriedRemainder: number): Worked {
  const work = new Work();
  // Every amount below is written in Grace so a person can redo it with a
  // pencil; the recorded results stay in hundredths so they can be compared
  // with the run exactly.
  const pot = work.graceStep(
    "The pot to share out",
    { meltedThisRun: fmtCentsForWork(run.totalDecayed), carriedFromLastRun: fmtCentsForWork(carriedRemainder) },
    `${fmtCentsForWork(run.totalDecayed)} melted off positive balances this run + ${fmtCentsForWork(carriedRemainder)} left over from last time`,
    run.totalDecayed + carriedRemainder,
    `Each positive balance lost ${Math.round(run.rateMonthly * 100)}% for ${run.days} days, rounded down to the cent. Nothing is taken from anyone at or below zero.`,
  );
  const dividend = work.graceStep(
    "Each verified member's share",
    { pot: fmtCentsForWork(pot), verifiedMembers: run.members },
    run.members ? `${fmtCentsForWork(pot)} ÷ ${run.members} = ${(pot / 100 / run.members).toFixed(4)}, rounded down to the cent` : "no verified members: nothing is paid out",
    run.members ? Math.floor(pot / run.members) : 0,
    "Every verified member gets the same share, whether they held nothing or a lot. Hoarding funds everyone.",
  );
  const remainder = work.graceStep(
    "Carried to the next run",
    { pot: fmtCentsForWork(pot), paidOut: fmtCentsForWork(dividend * run.members) },
    `${fmtCentsForWork(pot)} − ${fmtCentsForWork(dividend)} × ${run.members}`,
    pot - dividend * run.members,
    "The cents that do not divide evenly wait for the next run, so the books still sum to zero.",
  );
  return {
    title: "The last melt (demurrage)",
    source: "src/lib/demurrage.ts",
    steps: work.steps,
    result: `each verified member received ${fmtCentsForWork(dividend)} Grace; ${fmtCentsForWork(remainder)} carried forward`,
  };
}

export async function explainLatestDemurrage(): Promise<{ worked: Worked; run: DemurrageRunLike; matchesRecord: boolean } | null> {
  const [run, previous] = await db.demurrageRun.findMany({ orderBy: { ranAt: "desc" }, take: 2 });
  if (!run) return null;
  const worked = explainDemurrageRun(run, previous?.remainder ?? 0);
  const derivedDividend = worked.steps[1].result;
  const derivedRemainder = worked.steps[2].result;
  return { worked, run, matchesRecord: derivedDividend === run.dividend && derivedRemainder === run.remainder };
}

// --- The books balance -------------------------------------------------------

export type ZeroSumParts = { graceBalances: number; hoursBalances: number; carriedRemainder: number; reservedInVouchers: number; lockedInCash: number };

// Every Grace balance nets to zero once three things are counted: the cents
// the last melt carried forward, Grace reserved inside unredeemed vouchers,
// and Grace locked into cash notes. This is the invariant the whole design
// rests on: there is no treasury, only promises that cancel.
export async function zeroSumParts(): Promise<ZeroSumParts> {
  const [balances, run, voucherAgg, cashAgg] = await Promise.all([
    db.user.aggregate({ _sum: { graceBalance: true, hoursBalance: true } }),
    db.demurrageRun.findFirst({ orderBy: { ranAt: "desc" }, select: { remainder: true } }),
    db.voucher.aggregate({ where: { status: "ISSUED" }, _sum: { amount: true } }),
    db.cashNote.aggregate({ where: { status: "LOCKED" }, _sum: { denomination: true } }),
  ]);
  return {
    graceBalances: balances._sum.graceBalance ?? 0,
    hoursBalances: balances._sum.hoursBalance ?? 0,
    carriedRemainder: run?.remainder ?? 0,
    reservedInVouchers: voucherAgg._sum.amount ?? 0,
    lockedInCash: denominationCents(cashAgg._sum.denomination ?? 0),
  };
}

export function explainZeroSum(parts: ZeroSumParts): Worked & { balances: boolean } {
  const work = new Work();
  const graceTotal = work.graceStep(
    "Grace, everything counted",
    {
      allBalances: fmtCentsForWork(parts.graceBalances),
      carriedByDemurrage: fmtCentsForWork(parts.carriedRemainder),
      reservedInVouchers: fmtCentsForWork(parts.reservedInVouchers),
      lockedInCashNotes: fmtCentsForWork(parts.lockedInCash),
    },
    `${fmtCentsForWork(parts.graceBalances)} + ${fmtCentsForWork(parts.carriedRemainder)} + ${fmtCentsForWork(parts.reservedInVouchers)} + ${fmtCentsForWork(parts.lockedInCash)}`,
    parts.graceBalances + parts.carriedRemainder + parts.reservedInVouchers + parts.lockedInCash,
    "A voucher or a cash note is Grace taken off a balance and held in the note until it is redeemed, so it still counts.",
  );
  const hoursTotal = work.step("Hours, all balances (minutes)", { allBalances: parts.hoursBalances }, "sum of every Hours balance", parts.hoursBalances);
  const balances = work.step(
    "Do the books balance?",
    { graceTotal: fmtCentsForWork(graceTotal), hoursTotal },
    `${fmtCentsForWork(graceTotal)} == 0 and ${hoursTotal} == 0`,
    graceTotal === 0 && hoursTotal === 0,
    "If this is ever false, something wrote a balance outside the ledger rules. The hash chain (Verify ledger) shows where.",
  );
  return { title: "The books balance", source: "src/lib/explain.ts", steps: work.steps, result: balances ? "yes" : "NO", balances };
}

// --- Who can be drawn as a mediator here ------------------------------------

export function explainKeeperPool(localityPopulation: number): Worked {
  const work = new Work();
  const size = work.step(
    "Size of the mediator pool in your locality",
    { peopleInLocality: localityPopulation },
    `max(3, ceil(5 × sqrt(${localityPopulation} / 100)))`,
    keeperPoolSize(localityPopulation),
    "About five per hundred, growing with the square root of the population. The pool is the highest-standing verified people who are not newcomers; three are drawn from it by a public random beacon for each dispute.",
  );
  return { title: "Who can be drawn as a mediator", source: "src/lib/keepers.ts", steps: work.steps, result: `${size} people` };
}

export { DEMURRAGE_RATE_MONTHLY };
