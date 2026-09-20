import { db } from "./db";
import { verifyMessage, vouchToken } from "./keys";
import { getStandingAll } from "./standing.all";

// Sabul is the quiet villain of The Dispossessed: in a society with no bosses,
// he accretes power by controlling channels and appropriating others' work.
// Here he is turned into a critic. His job is to ask, of the live data, the
// question he would ask if he wanted to seize power: where could I? Every
// finding is a place the design's ideals are under strain. This is a mirror
// for ongoing self-audit, not a verdict.

export type Severity = "ok" | "watch" | "warn";
export type Finding = { id: string; title: string; severity: Severity; detail: string; sabul: string };

function shareOfTop(counts: number[], topN: number): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const top = [...counts].sort((a, b) => b - a).slice(0, topN).reduce((a, b) => a + b, 0);
  return top / total;
}

export async function critique(): Promise<{ findings: Finding[]; members: number }> {
  const [standings, vouches, users, bulletins, commons, circles] = await Promise.all([
    getStandingAll(),
    db.vouch.findMany({ include: { from: { select: { publicKey: true } } } }),
    db.user.findMany({ select: { id: true, username: true, graceBalance: true } }),
    db.bulletin.groupBy({ by: ["authorId"], _count: { _all: true } }),
    db.commons.groupBy({ by: ["stewardId"], _count: { _all: true } }),
    db.circle.findMany({ where: { status: "RESOLVED" }, select: { keeperIds: true } }),
  ]);
  const members = users.length;
  const findings: Finding[] = [];

  // 1. Standing concentration: is reputation pooling in a few hands?
  const vouchCounts = [...standings.values()].map((s) => s.vouchesReceived);
  const topVouchShare = shareOfTop(vouchCounts, Math.max(1, Math.ceil(members * 0.1)));
  findings.push({
    id: "standing-concentration",
    title: "Concentration of trust",
    severity: topVouchShare > 0.6 ? "warn" : topVouchShare > 0.45 ? "watch" : "ok",
    detail: `The top tenth of members hold ${Math.round(topVouchShare * 100)}% of all vouches. Standing gates only credit here, so this is not power on its own — but it is where power would begin.`,
    sabul: topVouchShare > 0.45 ? "A handful of well-vouched names. I would befriend exactly those and let their trust rub off as mine." : "Trust is spread thin enough that no name is worth capturing. Tiresome.",
  });

  // 2. Credit concentration despite demurrage: is anyone hoarding Grace?
  const balances = users.map((u) => u.graceBalance).filter((b) => b > 0);
  const topCreditShare = shareOfTop(balances, Math.max(1, Math.ceil(members * 0.1)));
  const richest = [...users].sort((a, b) => b.graceBalance - a.graceBalance)[0];
  findings.push({
    id: "credit-concentration",
    title: "Hoarding against the current",
    severity: topCreditShare > 0.7 ? "warn" : topCreditShare > 0.5 ? "watch" : "ok",
    detail: `Demurrage bleeds positive balances back to everyone, yet the top tenth still hold ${Math.round(topCreditShare * 100)}% of positive Grace${richest && richest.graceBalance > 0 ? ` (most: @${richest.username})` : ""}. Persistent hoards mean demurrage is too gentle.`,
    sabul: topCreditShare > 0.5 ? "Someone is sitting on credit while it melts. Either they are careless, or they know something the melt does not reach." : "Credit keeps moving. Nothing to sit on, nothing to lend at a favor's interest.",
  });

  // 3. Vouch rings: reciprocal-only pairs that could manufacture verification.
  const received = new Map<string, Set<string>>();
  for (const v of vouches) received.set(v.toId, (received.get(v.toId) ?? new Set()).add(v.fromId));
  let reciprocalOnly = 0;
  const seen = new Set<string>();
  for (const v of vouches) {
    const key = [v.fromId, v.toId].sort().join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    const back = received.get(v.fromId)?.has(v.toId);
    const fromOthers = (received.get(v.fromId)?.size ?? 0) === 1 && (received.get(v.toId)?.size ?? 0) === 1;
    if (back && fromOthers) reciprocalOnly++;
  }
  findings.push({
    id: "vouch-rings",
    title: "Rings that vouch only for each other",
    severity: reciprocalOnly > 0 ? "watch" : "ok",
    detail: `${reciprocalOnly} pair${reciprocalOnly === 1 ? "" : "s"} vouch for each other and no one else. Small isolated rings are how fake people would try to verify each other; verification counts vouches from already-verified locals to blunt this, but rings are worth watching.`,
    sabul: reciprocalOnly > 0 ? "Two names holding each other up, touching no one else. I have seen forgeries built on less." : "No closed rings. Every trust reaches outward. Hard to fake.",
  });

  // 4. Gatekeeping a channel: does one author dominate the bulletins?
  const bShare = shareOfTop(bulletins.map((b) => b._count._all), 1);
  const cShare = shareOfTop(commons.map((c) => c._count._all), 1);
  findings.push({
    id: "channel-capture",
    title: "One voice on a shared channel",
    severity: bShare > 0.6 && bulletins.length > 2 ? "watch" : "ok",
    detail: `The busiest bulletin author posts ${Math.round(bShare * 100)}% of live notices; the busiest steward keeps ${Math.round(cShare * 100)}% of the commons. A channel spoken by one voice is a channel one voice controls.`,
    sabul: bShare > 0.6 && bulletins.length > 2 ? "Whoever writes the notices decides what is true. I would want to be that person." : "The channels have many voices. Nothing to stand in the middle of.",
  });

  // 5. Lottery fairness: are mediators actually drawn evenly?
  const keeperCounts = new Map<string, number>();
  for (const c of circles) for (const k of c.keeperIds) keeperCounts.set(k, (keeperCounts.get(k) ?? 0) + 1);
  const totalSeats = [...keeperCounts.values()].reduce((a, b) => a + b, 0);
  const topKeeper = [...keeperCounts.values()].sort((a, b) => b - a)[0] ?? 0;
  findings.push({
    id: "lottery-fairness",
    title: "Who keeps ending up as mediator",
    severity: totalSeats >= 6 && topKeeper / totalSeats > 0.4 ? "watch" : "ok",
    detail: totalSeats === 0 ? "No disputes have been mediated yet, so there is nothing to check." : `Across ${totalSeats} mediator seats, the most-drawn person filled ${Math.round((topKeeper / totalSeats) * 100)}%. The draw is seeded from a public beacon and logged, so any skew is recomputable rather than hidden.`,
    sabul: totalSeats >= 6 && topKeeper / totalSeats > 0.4 ? "The same face keeps judging. Even by honest lot, that face learns where the bodies are." : "The lot spreads the seats. No one becomes the judge.",
  });

  // 6. Signature coverage: how much of the web of trust is forgeable?
  const signed = vouches.filter((v) => v.signature && v.from.publicKey && verifyMessage(vouchToken(v.fromId, v.toId), v.signature, v.from.publicKey)).length;
  const coverage = vouches.length ? signed / vouches.length : 1;
  findings.push({
    id: "signature-coverage",
    title: "How much trust is unforgeable",
    severity: vouches.length > 0 && coverage < 0.25 ? "warn" : coverage < 0.6 ? "watch" : "ok",
    detail: `${signed} of ${vouches.length} vouches are signed with the voucher's identity key (${Math.round(coverage * 100)}%). Unsigned vouches rest on trusting this server; signed ones can be verified anywhere, by anyone. The more that are signed, the less a server — or a Sabul — can forge.`,
    sabul: coverage < 0.6 ? "Most endorsements are just the server's word. Control the server and I write whoever's trust I please." : "Nearly every vouch carries its own signature. I cannot forge what I did not sign.",
  });

  return { findings, members };
}
