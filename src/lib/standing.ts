
// Standing is the only "rank" in Freewill, and it is computed, never assigned.
// It rises with vouches received, pledges kept, exchange, tenure, and circles
// kept; it falls when a circle finds you caused harm, or that you accused
// someone falsely. Standing sets how far into mutual credit a person may go,
// how many circles they may have open, and whether they may keep circles or
// vote. Nothing else.

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
  graceLimit: number; // how negative Grace may go (0 if unverified)
  hoursLimit: number; // how negative Hours may go, in minutes
  circleAllowance: number; // how many circles this person may have open at once
};

// How many vouches make a real person. Grows with the locality, but slower
// than the locality: 1 at 5 people, 3 at 100, 7 at 400+, never more.
export function requiredVouchesFor(population: number) {
  return Math.min(7, Math.max(1, Math.round(Math.sqrt(Math.max(population, 1)) / 3)));
}

export function computeStanding(i: {
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
}): Standing {
  const requiredVouches = requiredVouchesFor(i.localityPopulation);
  const counted = i.bootstrap ? i.vouchesReceived : i.vouchesFromVerified;
  const verified = counted >= requiredVouches;

  const vouchScore = Math.min(i.vouchesReceived, 12) * 5; // up to 60
  const pledgeScore = Math.min(i.pledgesKept, 25) * 3; // up to 75
  const activityScore = Math.min(i.transfers, 40); // up to 40
  const keptScore = Math.min(i.circlesKept, 5) * 4; // up to 20
  const tenureScore = Math.min(Math.floor(i.memberDays / 30), 12) * 2; // up to 24
  const penalty = i.harms * 15 + i.unfounded * 10;
  const score = Math.max(0, vouchScore + pledgeScore + activityScore + keptScore + tenureScore - penalty);

  const tier: StandingTier =
    score >= 90 ? "pillar" : score >= 45 ? "trusted" : score >= 10 ? "neighbor" : "newcomer";

  return {
    vouchesReceived: i.vouchesReceived,
    vouchesGiven: i.vouchesGiven,
    pledgesKept: i.pledgesKept,
    transfers: i.transfers,
    circlesKept: i.circlesKept,
    harms: i.harms,
    unfounded: i.unfounded,
    memberDays: i.memberDays,
    localityPopulation: i.localityPopulation,
    requiredVouches,
    verified,
    score,
    tier,
    graceLimit: verified ? 20 + Math.round(score * 1.5) : 0,
    hoursLimit: verified ? (5 + Math.round(score / 5)) * 60 : 0,
    circleAllowance: Math.max(1, 2 + Math.floor(score / 40) - i.unfounded),
  };
}

export const TIER_LABEL: Record<StandingTier, string> = {
  newcomer: "Newcomer",
  neighbor: "Neighbor",
  trusted: "Trusted",
  pillar: "Pillar",
};
