import { db } from "./db";
import { localityKey } from "./form";
import { computeStanding, requiredVouchesFor, type Standing, type StandingInput } from "./standing";

export type Member = { id: string; username: string; locality: string; createdAt: Date };
export type StandingMap = Map<string, Standing & { user: Member }>;

// Standing for everyone at once, in a handful of grouped queries. Verification
// is relative to the locality, and a vouch counts fully only when it comes from
// someone who is themselves verified. To bootstrap a new locality, all vouches
// count until there are at least `requiredVouches` verified people there.
//
// The work happens in two halves so the "Show the work" page can reuse the
// first: `getStandingInputs` gathers, for every member, the raw counts the
// rule needs; `getStandingAll` runs the rule over them.

type MemberRow = Member & { humanVerifiedAt: Date | null };

export async function getStandingInputs(): Promise<Map<string, StandingInput & { user: MemberRow }>> {
  const [members, vouches, completedPledgesByUser, transfersSentByUser, transfersReceivedByUser, harmsFoundAboutUser, unfoundedRaisedByUser, resolvedCircles] = await Promise.all([
    db.user.findMany({ select: { id: true, username: true, locality: true, createdAt: true, humanVerifiedAt: true } }),
    db.vouch.findMany({ select: { fromId: true, toId: true } }),
    db.pledge.groupBy({ by: ["userId"], where: { status: "COMPLETED" }, _count: { _all: true } }),
    db.transfer.groupBy({ by: ["fromId"], _count: { _all: true } }),
    db.transfer.groupBy({ by: ["toId"], _count: { _all: true } }),
    db.circle.groupBy({ by: ["aboutId"], where: { status: "RESOLVED", outcome: "HARM_FOUND" }, _count: { _all: true } }),
    db.circle.groupBy({ by: ["raisedById"], where: { status: "RESOLVED", outcome: "UNFOUNDED" }, _count: { _all: true } }),
    db.circle.findMany({ where: { status: "RESOLVED" }, select: { keeperIds: true } }),
  ]);

  // Turn each grouped query into "user id -> count".
  const countByUser = (rows: { _count: { _all: number } }[], userIdOf: (row: never) => string | null) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const userId = userIdOf(row as never);
      if (userId) counts.set(userId, row._count._all);
    }
    return counts;
  };
  const pledgesKept = countByUser(completedPledgesByUser, (row: { userId: string }) => row.userId);
  const transfersSent = countByUser(transfersSentByUser, (row: { fromId: string }) => row.fromId);
  const transfersReceived = countByUser(transfersReceivedByUser, (row: { toId: string }) => row.toId);
  const harmsFound = countByUser(harmsFoundAboutUser, (row: { aboutId: string | null }) => row.aboutId);
  const unfoundedAccusations = countByUser(unfoundedRaisedByUser, (row: { raisedById: string }) => row.raisedById);

  // How many resolved disputes each person served on as a mediator.
  const disputesMediated = new Map<string, number>();
  for (const circle of resolvedCircles) {
    for (const keeperId of circle.keeperIds) disputesMediated.set(keeperId, (disputesMediated.get(keeperId) ?? 0) + 1);
  }

  // Who vouched for whom.
  const vouchersOf = new Map<string, string[]>(); // user id -> ids of people who vouched for them
  const vouchesGivenBy = new Map<string, number>();
  for (const vouch of vouches) {
    vouchersOf.set(vouch.toId, [...(vouchersOf.get(vouch.toId) ?? []), vouch.fromId]);
    vouchesGivenBy.set(vouch.fromId, (vouchesGivenBy.get(vouch.fromId) ?? 0) + 1);
  }

  // Population per locality, grouped by a case-insensitive key so "North
  // Ridge" and "north ridge" count as the same place.
  const populationOfLocality = new Map<string, number>();
  for (const member of members) {
    const key = localityKey(member.locality);
    populationOfLocality.set(key, (populationOfLocality.get(key) ?? 0) + 1);
  }
  const populationFor = (member: MemberRow) => populationOfLocality.get(localityKey(member.locality)) ?? 1;

  // Pass 1: who would be verified if every vouch counted. Pass 2 (inside the
  // rule) counts only vouches from these people, unless the locality is still
  // bootstrapping, meaning it has fewer pass-1 verified people than the number
  // of vouches it requires.
  const verifiedCountingEveryVouch = new Set<string>();
  for (const member of members) {
    const idmeBonus = member.humanVerifiedAt !== null ? 1 : 0;
    const vouchesReceived = vouchersOf.get(member.id)?.length ?? 0;
    if (vouchesReceived + idmeBonus >= requiredVouchesFor(populationFor(member))) verifiedCountingEveryVouch.add(member.id);
  }
  const verifiedPeopleInLocality = new Map<string, number>();
  for (const member of members) {
    if (!verifiedCountingEveryVouch.has(member.id)) continue;
    const key = localityKey(member.locality);
    verifiedPeopleInLocality.set(key, (verifiedPeopleInLocality.get(key) ?? 0) + 1);
  }

  const now = Date.now();
  const inputs = new Map<string, StandingInput & { user: MemberRow }>();
  for (const member of members) {
    const population = populationFor(member);
    const voucherIds = vouchersOf.get(member.id) ?? [];
    inputs.set(member.id, {
      user: member,
      vouchesReceived: voucherIds.length,
      vouchesFromVerified: voucherIds.filter((voucherId) => verifiedCountingEveryVouch.has(voucherId)).length,
      vouchesGiven: vouchesGivenBy.get(member.id) ?? 0,
      pledgesKept: pledgesKept.get(member.id) ?? 0,
      transfers: (transfersSent.get(member.id) ?? 0) + (transfersReceived.get(member.id) ?? 0),
      circlesKept: disputesMediated.get(member.id) ?? 0,
      harms: harmsFound.get(member.id) ?? 0,
      unfounded: unfoundedAccusations.get(member.id) ?? 0,
      memberDays: Math.floor((now - member.createdAt.getTime()) / 86_400_000),
      localityPopulation: population,
      bootstrap: (verifiedPeopleInLocality.get(localityKey(member.locality)) ?? 0) < requiredVouchesFor(population),
      humanVerified: member.humanVerifiedAt !== null,
    });
  }
  return inputs;
}

export async function getStandingAll(): Promise<StandingMap> {
  const inputs = await getStandingInputs();
  const standings: StandingMap = new Map();
  for (const [userId, { user, ...input }] of inputs) {
    standings.set(userId, { ...computeStanding(input), user });
  }
  return standings;
}

export async function getStanding(userId: string): Promise<Standing> {
  const all = await getStandingAll();
  const standing = all.get(userId);
  if (!standing) throw new Error("No such person.");
  return standing;
}
