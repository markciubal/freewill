import { db } from "./db";
import { drawSeed, fetchBeacon, seededDraw } from "./beacon";
import { getStandingAll } from "./standing.all";

// Mediators (code name: keepers) are chosen by public lottery, not by
// volunteering. The pool is the highest-standing verified people in the
// dispute's locality, about five per hundred, growing with the square root of
// the population. Each draw is seeded from the drand public randomness beacon
// and logged on the dispute (pool, seed, result), so nobody - including the
// operator - can quietly redraw until they like the panel.

export function keeperPoolSize(population: number) {
  return Math.max(3, Math.ceil(5 * Math.sqrt(Math.max(population, 1) / 100)));
}

export const KEEPERS_PER_CIRCLE = 3;

// The eligible pool, deterministically ordered (score desc, then id) so a
// logged draw can be recomputed exactly.
export async function keeperPool(opts: { locality: string; exclude: string[] }) {
  const all = await getStandingAll();
  const excluded = new Set(opts.exclude);
  const eligible = [...all.values()].filter((s) => s.verified && s.tier !== "newcomer" && !excluded.has(s.user.id));
  const byRank = (a: (typeof eligible)[number], b: (typeof eligible)[number]) =>
    b.score - a.score || (a.user.id < b.user.id ? -1 : 1);
  const local = eligible.filter((s) => s.user.locality === opts.locality).sort(byRank);
  const localPop = [...all.values()].filter((s) => s.user.locality === opts.locality).length;

  let pool = local.slice(0, keeperPoolSize(localPop));
  if (pool.length < KEEPERS_PER_CIRCLE) pool = eligible.sort(byRank).slice(0, keeperPoolSize(all.size));
  return pool.map((s) => ({ id: s.user.id, username: s.user.username }));
}

// Fill any empty mediator seats on a dispute, seeded by the public beacon, and
// append an audit entry. Safe to call repeatedly.
export async function fillKeepers(circleId: string) {
  const c = await db.circle.findUnique({ where: { id: circleId } });
  if (!c || (c.status !== "OPEN" && c.status !== "GATHERING")) return c;
  const short = c.keepersNeeded - c.keeperIds.length;
  if (short <= 0) return c;

  const exclude = [c.raisedById, ...(c.aboutId ? [c.aboutId] : []), ...c.keeperIds, ...c.declinedKeeperIds];
  const pool = await keeperPool({ locality: c.locality, exclude });
  if (!pool.length) return c;

  const beacon = await fetchBeacon();
  const seed = drawSeed(c.id, beacon.randomness);
  const drawn = seededDraw(pool, short, seed);

  const entry = [
    new Date().toISOString(),
    `source=${beacon.source}`,
    beacon.source === "drand" ? `round=${beacon.round}` : `randomness=${beacon.randomness}`,
    `seed=${seed}`,
    `pool=${pool.map((p) => p.username).join(",")}`,
    `drew=${drawn.map((p) => p.username).join(",")}`,
  ].join(" ");

  return db.circle.update({
    where: { id: circleId },
    data: { keeperIds: { push: drawn.map((p) => p.id) }, status: "GATHERING", drawLog: { push: entry } },
  });
}
