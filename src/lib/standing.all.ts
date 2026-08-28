import { db } from "./db";
import { computeStanding, requiredVouchesFor, type Standing } from "./standing";

export type Member = { id: string; username: string; locality: string; createdAt: Date };
export type StandingMap = Map<string, Standing & { user: Member }>;

// Standing for everyone at once, in a handful of grouped queries. Verification
// is relative to the locality, and a vouch counts fully only when it comes from
// someone who is themselves verified. To bootstrap a new locality, all vouches
// count until there are at least `requiredVouches` verified people there.
export async function getStandingAll(): Promise<StandingMap> {
  const [users, vouches, pledges, tOut, tIn, harms, unfounded, kept] = await Promise.all([
    db.user.findMany({ select: { id: true, username: true, locality: true, createdAt: true } }),
    db.vouch.findMany({ select: { fromId: true, toId: true } }),
    db.pledge.groupBy({ by: ["userId"], where: { status: "COMPLETED" }, _count: { _all: true } }),
    db.transfer.groupBy({ by: ["fromId"], _count: { _all: true } }),
    db.transfer.groupBy({ by: ["toId"], _count: { _all: true } }),
    db.circle.groupBy({ by: ["aboutId"], where: { status: "RESOLVED", outcome: "HARM_FOUND" }, _count: { _all: true } }),
    db.circle.groupBy({ by: ["raisedById"], where: { status: "RESOLVED", outcome: "UNFOUNDED" }, _count: { _all: true } }),
    db.circle.findMany({ where: { status: "RESOLVED" }, select: { keeperIds: true } }),
  ]);

  const count = (rows: { _count: { _all: number } }[], key: (r: never) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = key(r as never);
      if (k) m.set(k, r._count._all);
    }
    return m;
  };
  const pledgesKept = count(pledges, (r: { userId: string }) => r.userId);
  const outCount = count(tOut, (r: { fromId: string }) => r.fromId);
  const inCount = count(tIn, (r: { toId: string }) => r.toId);
  const harmCount = count(harms, (r: { aboutId: string | null }) => r.aboutId);
  const unfoundedCount = count(unfounded, (r: { raisedById: string }) => r.raisedById);
  const keptCount = new Map<string, number>();
  for (const c of kept) for (const k of c.keeperIds) keptCount.set(k, (keptCount.get(k) ?? 0) + 1);

  const received = new Map<string, string[]>();
  const given = new Map<string, number>();
  for (const v of vouches) {
    received.set(v.toId, [...(received.get(v.toId) ?? []), v.fromId]);
    given.set(v.fromId, (given.get(v.fromId) ?? 0) + 1);
  }

  const population = new Map<string, number>();
  for (const u of users) population.set(u.locality, (population.get(u.locality) ?? 0) + 1);

  // Pass 1: who would be verified counting every vouch. Pass 2: count only
  // vouches from pass-1 verified people, unless the locality is bootstrapping.
  const pass1 = new Set<string>();
  for (const u of users) {
    if ((received.get(u.id)?.length ?? 0) >= requiredVouchesFor(population.get(u.locality) ?? 1)) pass1.add(u.id);
  }
  const verifiedPerLocality = new Map<string, number>();
  for (const u of users) if (pass1.has(u.id)) verifiedPerLocality.set(u.locality, (verifiedPerLocality.get(u.locality) ?? 0) + 1);

  const now = Date.now();
  const map: StandingMap = new Map();
  for (const u of users) {
    const pop = population.get(u.locality) ?? 1;
    const from = received.get(u.id) ?? [];
    const s = computeStanding({
      vouchesReceived: from.length,
      vouchesFromVerified: from.filter((f) => pass1.has(f)).length,
      vouchesGiven: given.get(u.id) ?? 0,
      pledgesKept: pledgesKept.get(u.id) ?? 0,
      transfers: (outCount.get(u.id) ?? 0) + (inCount.get(u.id) ?? 0),
      circlesKept: keptCount.get(u.id) ?? 0,
      harms: harmCount.get(u.id) ?? 0,
      unfounded: unfoundedCount.get(u.id) ?? 0,
      memberDays: Math.floor((now - u.createdAt.getTime()) / 86_400_000),
      localityPopulation: pop,
      bootstrap: (verifiedPerLocality.get(u.locality) ?? 0) < requiredVouchesFor(pop),
    });
    map.set(u.id, { ...s, user: u });
  }
  return map;
}

export async function getStanding(userId: string): Promise<Standing> {
  const all = await getStandingAll();
  const s = all.get(userId);
  if (!s) throw new Error("No such person.");
  return s;
}
