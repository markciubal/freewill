import { db } from "./db";
import { getStanding } from "./standing.all";

// A public "who am I about to trust?" snapshot, shown before you pay someone or
// extend them credit. Everything here is already public (the ledger and
// standing are open by design); this just gathers it at the moment of decision.
// Your line was exactly right: you should see that someone already owes the
// commons a great deal before you hand them more.

export type TrustPreview = {
  username: string;
  displayName: string | null;
  locality: string;
  graceBalance: number;
  hoursBalance: number;
  graceLimit: number;
  hoursLimit: number;
  tier: string;
  score: number;
  verified: boolean;
  vouchesReceived: number;
  pledgesKept: number;
  harms: number;
  openPledges: number; // promises they have made but not yet completed
  affiliations: string[];
  memberDays: number;
};

export async function getTrustPreview(username: string): Promise<TrustPreview | null> {
  const u = await db.user.findUnique({
    where: { username: username.toLowerCase().replace(/^@/, "") },
    select: {
      id: true, username: true, displayName: true, locality: true,
      graceBalance: true, hoursBalance: true, affiliations: true,
    },
  });
  if (!u) return null;
  const [standing, openPledges] = await Promise.all([
    getStanding(u.id),
    db.pledge.count({ where: { userId: u.id, status: { in: ["OFFERED", "ACCEPTED"] } } }),
  ]);
  return {
    username: u.username,
    displayName: u.displayName,
    locality: u.locality,
    graceBalance: u.graceBalance,
    hoursBalance: u.hoursBalance,
    graceLimit: standing.graceLimit,
    hoursLimit: standing.hoursLimit,
    tier: standing.tier,
    score: standing.score,
    verified: standing.verified,
    vouchesReceived: standing.vouchesReceived,
    pledgesKept: standing.pledgesKept,
    harms: standing.harms,
    openPledges,
    affiliations: u.affiliations,
    memberDays: standing.memberDays,
  };
}

// A short, honest read of the risk in extending credit to this person, from
// public signals only. Never a verdict, just what a careful neighbor notices.
export function trustFlags(p: TrustPreview): { tone: "accent" | "warn" | "danger" | "neutral"; text: string }[] {
  const flags: { tone: "accent" | "warn" | "danger" | "neutral"; text: string }[] = [];
  if (p.harms > 0) flags.push({ tone: "danger", text: `${p.harms} resolved dispute${p.harms === 1 ? "" : "s"} found harm by this person` });
  if (p.graceBalance <= -p.graceLimit && p.graceLimit > 0) flags.push({ tone: "danger", text: "at their Grace limit already" });
  else if (p.graceLimit > 0 && p.graceBalance < -Math.round(p.graceLimit * 0.75)) flags.push({ tone: "warn", text: "near their Grace limit" });
  if (!p.verified) flags.push({ tone: "warn", text: "not yet verified by neighbors" });
  if (p.memberDays < 14) flags.push({ tone: "warn", text: `new here (${p.memberDays} day${p.memberDays === 1 ? "" : "s"})` });
  if (p.harms === 0 && p.verified && p.pledgesKept >= 3) flags.push({ tone: "accent", text: `${p.pledgesKept} kept pledges, no harm on record` });
  return flags;
}
