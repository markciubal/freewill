import { Work, type WorkedStep } from "./worked";

// Standing is the only "rank" in Freewill, and it is computed, never assigned.
// It rises with vouches received, pledges kept, exchange, tenure, and circles
// kept; it falls when a circle finds you caused harm, or that you accused
// someone falsely. Standing sets how far into mutual credit a person may go,
// how many circles they may have open, and whether they may keep circles or
// vote. Nothing else.
//
// Every number below is computed by `computeStandingWithWork`, which also
// records each step it took (see worked.ts). The page "Show the work" renders
// those steps so any member can check their own standing by hand.

export type StandingTier = "newcomer" | "neighbor" | "trusted" | "pillar";

export type Standing = {
  score: number;
  tier: StandingTier;
  verified: boolean; // enough vouches to count as a real person in their locality
  requiredVouches: number;
  localityPopulation: number;
  vouchesReceived: number;
  vouchesGiven: number;
  pledgesKept: number;
  transfers: number;
  circlesKept: number;
  harms: number; // resolved circles about this person with HARM_FOUND
  unfounded: number; // circles this person raised that resolved UNFOUNDED
  memberDays: number;
  graceLimit: number; // how negative Grace may go, in cents (0 if unverified)
  hoursLimit: number; // how negative Hours may go, in minutes
  circleAllowance: number; // how many circles this person may have open at once
};

// The weights and caps of the score, in one place, so the code and the
// explanation are guaranteed to use the same numbers. Each line: how much one
// unit is worth, and how many units count at most.
export const STANDING_RULES = {
  vouches: { pointsEach: 5, countAtMost: 12 }, // up to 60
  pledgesKept: { pointsEach: 3, countAtMost: 25 }, // up to 75
  transfers: { pointsEach: 1, countAtMost: 40 }, // up to 40
  circlesKept: { pointsEach: 4, countAtMost: 5 }, // up to 20
  tenureMonths: { pointsEach: 2, countAtMost: 12 }, // up to 24
  harmPenalty: 15, // per circle that found you caused harm
  unfoundedPenalty: 10, // per accusation of yours a circle found unfounded
  tiers: { pillar: 90, trusted: 45, neighbor: 10 }, // minimum score for each tier
  graceLimit: { baseGrace: 20, gracePerPoint: 1.5 }, // whole Grace; stored as cents
  hoursLimit: { baseHours: 5, pointsPerHour: 5 },
  circles: { base: 2, pointsPerExtra: 40 },
  requiredVouches: { divisor: 3, atLeast: 1, atMost: 7 },
} as const;

// How many vouches make a real person. Grows with the locality, but slower
// than the locality: 1 at 5 people, 3 at 100, 7 at 400+, never more.
export function requiredVouchesFor(population: number) {
  const { divisor, atLeast, atMost } = STANDING_RULES.requiredVouches;
  return Math.min(atMost, Math.max(atLeast, Math.round(Math.sqrt(Math.max(population, 1)) / divisor)));
}

export type StandingInput = {
  vouchesReceived: number;
  vouchesFromVerified: number;
  vouchesGiven: number;
  pledgesKept: number;
  transfers: number;
  circlesKept: number;
  harms: number;
  unfounded: number;
  memberDays: number;
  localityPopulation: number;
  bootstrap: boolean; // too few verified people locally: count all vouches
  humanVerified?: boolean; // optional ID.me attestation: one extra counted vouch
};

export function computeStanding(input: StandingInput): Standing {
  return computeStandingWithWork(input).standing;
}

// The computation and its record, in one pass.
export function computeStandingWithWork(input: StandingInput): { standing: Standing; work: WorkedStep[] } {
  const work = new Work();
  const rules = STANDING_RULES;

  // --- Verification: is this person vouched for by enough real locals? -----
  const requiredVouches = work.step(
    "Vouches needed in your locality",
    { peopleInLocality: input.localityPopulation },
    `round(sqrt(${input.localityPopulation}) / ${rules.requiredVouches.divisor}), kept between ${rules.requiredVouches.atLeast} and ${rules.requiredVouches.atMost}`,
    requiredVouchesFor(input.localityPopulation),
    "Grows with the locality but slower than it, so a big place needs more vouches without ever needing more than seven.",
  );
  const countedVouches = work.step(
    "Vouches that count toward verification",
    { vouchesReceived: input.vouchesReceived, vouchesFromVerifiedPeople: input.vouchesFromVerified, localityIsBootstrapping: input.bootstrap, idmeAttestation: input.humanVerified ? 1 : 0 },
    input.bootstrap
      ? `all ${input.vouchesReceived} vouches count while the locality has too few verified people to vouch for each other, + ${input.humanVerified ? 1 : 0} from ID.me`
      : `only the ${input.vouchesFromVerified} vouches from already-verified locals count, + ${input.humanVerified ? 1 : 0} from ID.me`,
    (input.bootstrap ? input.vouchesReceived : input.vouchesFromVerified) + (input.humanVerified ? 1 : 0),
    "Counting only vouches from verified people is what stops a ring of fake accounts from verifying each other.",
  );
  const verified = work.step(
    "Verified?",
    { countedVouches, requiredVouches },
    `${countedVouches} >= ${requiredVouches}`,
    countedVouches >= requiredVouches,
    "Verification gates credit, vouching, mediating, proposing and voting. It gates nothing else.",
  );

  // --- Score: five things that add, two that subtract -----------------------
  const scorePart = (label: string, count: number, rule: { pointsEach: number; countAtMost: number }, unit: string) =>
    work.step(
      label,
      { [unit]: count, countAtMost: rule.countAtMost, pointsEach: rule.pointsEach },
      `min(${count}, ${rule.countAtMost}) × ${rule.pointsEach}`,
      Math.min(count, rule.countAtMost) * rule.pointsEach,
    );
  const vouchScore = scorePart("Points from vouches received", input.vouchesReceived, rules.vouches, "vouchesReceived");
  const pledgeScore = scorePart("Points from pledges kept", input.pledgesKept, rules.pledgesKept, "pledgesKept");
  const activityScore = scorePart("Points from exchange", input.transfers, rules.transfers, "transfers");
  const keptScore = scorePart("Points from disputes mediated", input.circlesKept, rules.circlesKept, "disputesMediated");
  const tenureMonths = Math.floor(input.memberDays / 30);
  const tenureScore = scorePart("Points from time as a member", tenureMonths, rules.tenureMonths, "wholeMonths");
  const penalty = work.step(
    "Penalty",
    { harmFound: input.harms, unfoundedAccusations: input.unfounded, perHarm: rules.harmPenalty, perUnfounded: rules.unfoundedPenalty },
    `${input.harms} × ${rules.harmPenalty} + ${input.unfounded} × ${rules.unfoundedPenalty}`,
    input.harms * rules.harmPenalty + input.unfounded * rules.unfoundedPenalty,
    "Only a dispute resolved by drawn mediators can lower standing: harm they found, or an accusation they found unfounded.",
  );
  const score = work.step(
    "Score",
    { vouchScore, pledgeScore, activityScore, keptScore, tenureScore, penalty },
    `max(0, ${vouchScore} + ${pledgeScore} + ${activityScore} + ${keptScore} + ${tenureScore} − ${penalty})`,
    Math.max(0, vouchScore + pledgeScore + activityScore + keptScore + tenureScore - penalty),
  );
  const tier = work.step(
    "Tier",
    { score, pillarFrom: rules.tiers.pillar, trustedFrom: rules.tiers.trusted, neighborFrom: rules.tiers.neighbor },
    `pillar at ${rules.tiers.pillar}+, trusted at ${rules.tiers.trusted}+, neighbor at ${rules.tiers.neighbor}+, otherwise newcomer`,
    (score >= rules.tiers.pillar ? "pillar" : score >= rules.tiers.trusted ? "trusted" : score >= rules.tiers.neighbor ? "neighbor" : "newcomer") as StandingTier,
    "The tier is a label for the score. It carries no powers of its own.",
  );

  // --- What the score is allowed to buy ---------------------------------------
  const graceLimit = work.graceStep(
    "Grace credit limit (how far below zero you may go)",
    { verified, score, baseGrace: rules.graceLimit.baseGrace, gracePerPoint: rules.graceLimit.gracePerPoint },
    verified ? `${rules.graceLimit.baseGrace} + round(${score} × ${rules.graceLimit.gracePerPoint}) Grace` : "0 until verified",
    verified ? (rules.graceLimit.baseGrace + Math.round(score * rules.graceLimit.gracePerPoint)) * 100 : 0,
    "Credit is the one thing standing controls.",
  );
  const hoursLimit = work.step(
    "Hours credit limit, in minutes",
    { verified, score, baseHours: rules.hoursLimit.baseHours, pointsPerHour: rules.hoursLimit.pointsPerHour },
    verified ? `(${rules.hoursLimit.baseHours} + round(${score} / ${rules.hoursLimit.pointsPerHour})) hours × 60` : "0 until verified",
    verified ? (rules.hoursLimit.baseHours + Math.round(score / rules.hoursLimit.pointsPerHour)) * 60 : 0,
  );
  const circleAllowance = work.step(
    "Disputes you may have open at once",
    { score, base: rules.circles.base, pointsPerExtra: rules.circles.pointsPerExtra, unfoundedAccusations: input.unfounded },
    `max(1, ${rules.circles.base} + floor(${score} / ${rules.circles.pointsPerExtra}) − ${input.unfounded})`,
    Math.max(1, rules.circles.base + Math.floor(score / rules.circles.pointsPerExtra) - input.unfounded),
    "Raising disputes that prove unfounded costs you the right to raise as many.",
  );

  const standing: Standing = {
    vouchesReceived: input.vouchesReceived,
    vouchesGiven: input.vouchesGiven,
    pledgesKept: input.pledgesKept,
    transfers: input.transfers,
    circlesKept: input.circlesKept,
    harms: input.harms,
    unfounded: input.unfounded,
    memberDays: input.memberDays,
    localityPopulation: input.localityPopulation,
    requiredVouches,
    verified,
    score,
    tier,
    graceLimit,
    hoursLimit,
    circleAllowance,
  };
  return { standing, work: work.steps };
}

export const TIER_LABEL: Record<StandingTier, string> = {
  newcomer: "Newcomer",
  neighbor: "Neighbor",
  trusted: "Trusted",
  pillar: "Pillar",
};
