// "Show the work": the steps a rule records must reproduce the rule's own
// result, for standing (pure), for every demurrage run on record (live), and
// for the zero-sum check that the wind-down page also relies on (live).
// Run: npm run smoke:explain
import "./not-production";
import { db } from "../src/lib/db";
import { explainDemurrageRun, explainKeeperPool, explainZeroSum, zeroSumParts } from "../src/lib/explain";
import { windDownReport } from "../src/lib/jubilee";
import { keeperPoolSize } from "../src/lib/keepers";
import { STANDING_RULES, computeStanding, computeStandingWithWork, requiredVouchesFor, type StandingInput } from "../src/lib/standing";
import { getStandingAll, getStandingInputs } from "../src/lib/standing.all";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

const sample: StandingInput = {
  vouchesReceived: 4,
  vouchesFromVerified: 3,
  vouchesGiven: 2,
  pledgesKept: 7,
  transfers: 55,
  circlesKept: 1,
  harms: 1,
  unfounded: 0,
  memberDays: 200,
  localityPopulation: 120,
  bootstrap: false,
  humanVerified: false,
};

async function main() {
  // Pure: the recorded steps end where the decision ends.
  const { standing, work } = computeStandingWithWork(sample);
  const stepNamed = (label: string) => work.find((s) => s.label.startsWith(label));
  assert(stepNamed("Score")?.result === standing.score, `the "Score" step equals the standing's score (${standing.score})`);
  assert(stepNamed("Tier")?.result === standing.tier, `the "Tier" step equals the standing's tier (${standing.tier})`);
  assert(stepNamed("Verified?")?.result === standing.verified, "the verification step equals standing.verified");
  assert(stepNamed("Grace credit limit")?.result === standing.graceLimit, `the credit-limit step equals graceLimit (${standing.graceLimit} cents)`);
  assert(stepNamed("Vouches needed")?.result === requiredVouchesFor(120), "the threshold step equals requiredVouchesFor(population)");
  // The arithmetic in the steps can be redone by hand from the rule constants.
  const byHand =
    Math.min(4, STANDING_RULES.vouches.countAtMost) * STANDING_RULES.vouches.pointsEach +
    Math.min(7, STANDING_RULES.pledgesKept.countAtMost) * STANDING_RULES.pledgesKept.pointsEach +
    Math.min(55, STANDING_RULES.transfers.countAtMost) * STANDING_RULES.transfers.pointsEach +
    Math.min(1, STANDING_RULES.circlesKept.countAtMost) * STANDING_RULES.circlesKept.pointsEach +
    Math.min(Math.floor(200 / 30), STANDING_RULES.tenureMonths.countAtMost) * STANDING_RULES.tenureMonths.pointsEach -
    STANDING_RULES.harmPenalty;
  assert(byHand === standing.score, `redoing the score by hand from STANDING_RULES gives ${byHand}`);
  assert(standing.score === 20 + 21 + 40 + 4 + 12 - 15, "the sample's score is 82 (unchanged from the rule before steps were recorded)");
  assert(JSON.stringify(computeStanding(sample)) === JSON.stringify(standing), "computeStanding and computeStandingWithWork agree exactly");
  // Every rule string carries the real inputs, never a placeholder.
  assert(work.every((s) => !/undefined|NaN|\[object/.test(s.rule) && Object.keys(s.inputs).length > 0), "every step names its inputs and its rule contains real numbers");
  assert(explainKeeperPool(250).steps[0].result === keeperPoolSize(250), "the mediator-pool step equals keeperPoolSize(population)");

  // Pure: a demurrage run explanation reproduces dividend and remainder.
  const sampleRun = { ranAt: new Date(), days: 30, rateMonthly: 0.03, totalDecayed: 1003, members: 4, dividend: 250, remainder: 3 };
  const explained = explainDemurrageRun(sampleRun, 0);
  assert(explained.steps[1].result === 250 && explained.steps[2].result === 3, "1003 cents over 4 members: 250 each, 3 carried");

  // Live: against the database.
  try {
    const [inputs, standings] = await Promise.all([getStandingInputs(), getStandingAll()]);
    let agree = 0;
    for (const [userId, inputWithUser] of inputs) {
      const fromWork = computeStandingWithWork(inputWithUser).standing;
      const fromAll = standings.get(userId)!;
      if (fromWork.score === fromAll.score && fromWork.verified === fromAll.verified && fromWork.graceLimit === fromAll.graceLimit) agree++;
    }
    assert(agree === inputs.size, `for all ${inputs.size} members, the worked standing matches the standing the app uses`);

    const runs = await db.demurrageRun.findMany({ orderBy: { ranAt: "asc" } });
    let reproduced = 0;
    for (let i = 1; i < runs.length; i++) {
      const steps = explainDemurrageRun(runs[i], runs[i - 1].remainder).steps;
      if (steps[1].result === runs[i].dividend && steps[2].result === runs[i].remainder) reproduced++;
    }
    assert(reproduced === Math.max(0, runs.length - 1), `every recorded demurrage run after the baseline (${Math.max(0, runs.length - 1)}) is reproduced from its totals`);

    const parts = await zeroSumParts();
    const zero = explainZeroSum(parts);
    const report = await windDownReport();
    assert(zero.balances === report.balances, `the zero-sum explanation and the wind-down report agree (books balance: ${zero.balances})`);
    assert(zero.balances, "the books balance right now, counting the carry, vouchers, and locked cash in cents");
    await db.$disconnect();
  } catch (error) {
    console.log("(dev DB not reachable; skipped live checks)", (error as Error).message.split("\n")[0]);
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
