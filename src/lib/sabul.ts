import { db } from "./db";
import { verifyMessage, vouchToken } from "./keys";
import { getStandingAll } from "./standing.all";

// Sabul is the quiet villain of The Dispossessed: in a society with no bosses,
// he accretes power by controlling channels and appropriating others' work.
// Here he is turned into a critic. His job is to ask, of the live data, the
// question he would ask if he wanted to seize power: where could I? Every
// finding is a place the design's ideals are under strain. This is a mirror
// for ongoing self-audit, not a verdict.
//
// Each finding also carries an action: what one member can do about it. The
// response to creeping power is distributed to everyone, never delegated to
// a class of guardians. There are no social workers here.

export type Severity = "ok" | "watch" | "warn";
export type Action = { text: string; href: string; label: string };
export type Finding = { id: string; title: string; severity: Severity; detail: string; sabul: string; action: Action };

// The thresholds every finding is judged against, in one place.
export const CRITIC_THRESHOLDS = {
  topTenthShareOfVouches: { watch: 0.45, warn: 0.6 },
  topTenthShareOfPositiveGrace: { watch: 0.5, warn: 0.7 },
  busiestAuthorShareOfBulletins: { watch: 0.6, minimumAuthors: 3 },
  mostDrawnMediatorShareOfSeats: { watch: 0.4, minimumSeats: 6 },
  signedShareOfVouches: { watch: 0.6, warn: 0.25 },
} as const;

// What fraction of the total the largest `topCount` values hold.
function shareHeldByTop(values: number[], topCount: number): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) return 0;
  const topSum = [...values].sort((a, b) => b - a).slice(0, topCount).reduce((sum, value) => sum + value, 0);
  return topSum / total;
}

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

export async function critique(): Promise<{ findings: Finding[]; members: number }> {
  const [standings, vouches, members, bulletinsByAuthor, commonsBySteward, resolvedCircles] = await Promise.all([
    getStandingAll(),
    db.vouch.findMany({ include: { from: { select: { publicKey: true } } } }),
    db.user.findMany({ select: { id: true, username: true, graceBalance: true } }),
    db.bulletin.groupBy({ by: ["authorId"], _count: { _all: true } }),
    db.commons.groupBy({ by: ["stewardId"], _count: { _all: true } }),
    db.circle.findMany({ where: { status: "RESOLVED" }, select: { keeperIds: true } }),
  ]);
  const memberCount = members.length;
  const topTenth = Math.max(1, Math.ceil(memberCount * 0.1));
  const thresholds = CRITIC_THRESHOLDS;
  const findings: Finding[] = [];

  // 1. Standing concentration: is reputation pooling in a few hands?
  const vouchesReceivedPerMember = [...standings.values()].map((standing) => standing.vouchesReceived);
  const topTenthVouchShare = shareHeldByTop(vouchesReceivedPerMember, topTenth);
  const trustConcentrated = topTenthVouchShare > thresholds.topTenthShareOfVouches.watch;
  findings.push({
    id: "standing-concentration",
    title: "Concentration of trust",
    severity: topTenthVouchShare > thresholds.topTenthShareOfVouches.warn ? "warn" : trustConcentrated ? "watch" : "ok",
    detail: `The top tenth of members hold ${percent(topTenthVouchShare)} of all vouches. Standing gates only credit here, so this is not power on its own — but it is where power would begin.`,
    sabul: trustConcentrated ? "A handful of well-vouched names. I would befriend exactly those and let their trust rub off as mine." : "Trust is spread thin enough that no name is worth capturing. Tiresome.",
    action: { text: "Vouch for someone you know who has fewer vouches than you. Trust spreads when it goes to the least-vouched, not the best-known.", href: "/people", label: "Find someone" },
  });

  // 2. Credit concentration despite demurrage: is anyone hoarding Grace?
  const positiveBalances = members.map((member) => member.graceBalance).filter((balance) => balance > 0);
  const topTenthCreditShare = shareHeldByTop(positiveBalances, topTenth);
  const richestMember = [...members].sort((a, b) => b.graceBalance - a.graceBalance)[0];
  const creditConcentrated = topTenthCreditShare > thresholds.topTenthShareOfPositiveGrace.watch;
  findings.push({
    id: "credit-concentration",
    title: "Hoarding against the current",
    severity: topTenthCreditShare > thresholds.topTenthShareOfPositiveGrace.warn ? "warn" : creditConcentrated ? "watch" : "ok",
    detail: `Demurrage bleeds positive balances back to everyone, yet the top tenth still hold ${percent(topTenthCreditShare)} of positive Grace${richestMember && richestMember.graceBalance > 0 ? ` (most: @${richestMember.username})` : ""}. Persistent hoards mean demurrage is too gentle.`,
    sabul: creditConcentrated ? "Someone is sitting on credit while it melts. Either they are careless, or they know something the melt does not reach." : "Credit keeps moving. Nothing to sit on, nothing to lend at a favor's interest.",
    action: { text: "If you are holding positive Grace, spend it: answer a need on the board or buy from someone who is short. Credit that moves cannot be hoarded.", href: "/board", label: "See the board" },
  });

  // 3. Vouch rings: pairs who vouch for each other and for no one else.
  const vouchersOf = new Map<string, Set<string>>(); // member id -> ids of those who vouched for them
  for (const vouch of vouches) vouchersOf.set(vouch.toId, (vouchersOf.get(vouch.toId) ?? new Set()).add(vouch.fromId));
  let isolatedPairs = 0;
  const pairsSeen = new Set<string>();
  for (const vouch of vouches) {
    const pairKey = [vouch.fromId, vouch.toId].sort().join(":");
    if (pairsSeen.has(pairKey)) continue;
    pairsSeen.add(pairKey);
    const vouchesBack = vouchersOf.get(vouch.fromId)?.has(vouch.toId);
    const eachHasOnlyTheOther = (vouchersOf.get(vouch.fromId)?.size ?? 0) === 1 && (vouchersOf.get(vouch.toId)?.size ?? 0) === 1;
    if (vouchesBack && eachHasOnlyTheOther) isolatedPairs++;
  }
  findings.push({
    id: "vouch-rings",
    title: "Rings that vouch only for each other",
    severity: isolatedPairs > 0 ? "watch" : "ok",
    detail: `${isolatedPairs} pair${isolatedPairs === 1 ? "" : "s"} vouch for each other and no one else. Small isolated rings are how fake people would try to verify each other; verification counts vouches from already-verified locals to blunt this, but rings are worth watching.`,
    sabul: isolatedPairs > 0 ? "Two names holding each other up, touching no one else. I have seen forgeries built on less." : "No closed rings. Every trust reaches outward. Hard to fake.",
    action: { text: "If the only person who vouches for you is the one you vouch for, vouch for a third person you both know. A ring becomes a web the moment it touches anyone else.", href: "/people", label: "Reach outward" },
  });

  // 4. Gatekeeping a channel: does one author dominate the bulletins?
  const busiestAuthorShare = shareHeldByTop(bulletinsByAuthor.map((row) => row._count._all), 1);
  const busiestStewardShare = shareHeldByTop(commonsBySteward.map((row) => row._count._all), 1);
  const channelCaptured = busiestAuthorShare > thresholds.busiestAuthorShareOfBulletins.watch && bulletinsByAuthor.length >= thresholds.busiestAuthorShareOfBulletins.minimumAuthors;
  findings.push({
    id: "channel-capture",
    title: "One voice on a shared channel",
    severity: channelCaptured ? "watch" : "ok",
    detail: `The busiest bulletin author posts ${percent(busiestAuthorShare)} of live notices; the busiest steward keeps ${percent(busiestStewardShare)} of the commons. A channel spoken by one voice is a channel one voice controls.`,
    sabul: channelCaptured ? "Whoever writes the notices decides what is true. I would want to be that person." : "The channels have many voices. Nothing to stand in the middle of.",
    action: { text: "Post a notice yourself, or take on stewarding one shared thing. A channel with many voices is a channel no one controls.", href: "/bulletins", label: "Post a notice" },
  });

  // 5. Lottery fairness: are mediators actually drawn evenly?
  const seatsHeldByMember = new Map<string, number>();
  for (const circle of resolvedCircles) for (const keeperId of circle.keeperIds) seatsHeldByMember.set(keeperId, (seatsHeldByMember.get(keeperId) ?? 0) + 1);
  const totalSeats = [...seatsHeldByMember.values()].reduce((sum, seats) => sum + seats, 0);
  const mostSeatsOnePerson = [...seatsHeldByMember.values()].sort((a, b) => b - a)[0] ?? 0;
  const lotterySkewed = totalSeats >= thresholds.mostDrawnMediatorShareOfSeats.minimumSeats && mostSeatsOnePerson / totalSeats > thresholds.mostDrawnMediatorShareOfSeats.watch;
  findings.push({
    id: "lottery-fairness",
    title: "Who keeps ending up as mediator",
    severity: lotterySkewed ? "watch" : "ok",
    detail: totalSeats === 0 ? "No disputes have been mediated yet, so there is nothing to check." : `Across ${totalSeats} mediator seats, the most-drawn person filled ${percent(mostSeatsOnePerson / totalSeats)}. The draw is seeded from a public beacon and logged, so any skew is recomputable rather than hidden.`,
    sabul: lotterySkewed ? "The same face keeps judging. Even by honest lot, that face learns where the bodies are." : "The lot spreads the seats. No one becomes the judge.",
    action: { text: "Stay in the draw. When your name comes up as mediator, serve; every person who steps back narrows the pool to the same faces.", href: "/circles", label: "See disputes" },
  });

  // 6. Signature coverage: how much of the web of trust is forgeable?
  const signedVouches = vouches.filter(
    (vouch) => vouch.signature && vouch.from.publicKey && verifyMessage(vouchToken(vouch.fromId, vouch.toId), vouch.signature, vouch.from.publicKey),
  ).length;
  const signedShare = vouches.length ? signedVouches / vouches.length : 1;
  const mostlyUnsigned = signedShare < thresholds.signedShareOfVouches.watch;
  findings.push({
    id: "signature-coverage",
    title: "How much trust is unforgeable",
    severity: vouches.length > 0 && signedShare < thresholds.signedShareOfVouches.warn ? "warn" : mostlyUnsigned ? "watch" : "ok",
    detail: `${signedVouches} of ${vouches.length} vouches are signed with the voucher's identity key (${percent(signedShare)}). Unsigned vouches rest on trusting this server; signed ones can be verified anywhere, by anyone. The more that are signed, the less a server — or a Sabul — can forge.`,
    sabul: mostlyUnsigned ? "Most endorsements are just the server's word. Control the server and I write whoever's trust I please." : "Nearly every vouch carries its own signature. I cannot forge what I did not sign.",
    action: { text: "Add an identity key, then open each person you have vouched for and update the vouch so it carries your signature.", href: "/keys", label: "Add a key" },
  });

  return { findings, members: memberCount };
}
