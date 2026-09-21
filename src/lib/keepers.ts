import { db } from "./db";
import { drawSeed, fetchBeacon, seededDraw } from "./beacon";
import { getStandingAll } from "./standing.all";

// Mediators (code name: keepers) are chosen by public lottery, not by
// volunteering. The pool is the highest-standing verified people in the
// dispute's locality, about five per hundred, growing with the square root of
// the population. Each draw is seeded from the drand public randomness beacon
// and logged on the dispute (pool, seed, result), so nobody - including the
// operator - can quietly redraw until they like the panel.
//
// The process for one dispute:
//   1. Work out how many seats are still empty.
//   2. Build the pool: verified, not a newcomer, not a party to the dispute,
//      not already seated, not someone who declined. Sorted by standing so
//      the same people are in the same order every time (a logged draw can
//      be recomputed exactly).
//   3. Fetch a public random value, derive the seed from it and the dispute id.
//   4. Draw the empty seats from the pool with that seed.
//   5. Write the seats and an audit line (source, round, seed, pool, drawn).

export function keeperPoolSize(population: number) {
  return Math.max(3, Math.ceil(5 * Math.sqrt(Math.max(population, 1) / 100)));
}

export const KEEPERS_PER_CIRCLE = 3;

// Where the mediators for a dispute here would come from, in a sentence. A
// small locality cannot seat a panel from its own people, so keeperPool
// widens to trusted people everywhere; a pool as big as the place itself is
// simply everyone eligible.
export function mediatorPoolSentence(poolSize: number, population: number): string {
  if (population < KEEPERS_PER_CIRCLE) {
    return `With only ${population} ${population === 1 ? "person" : "people"} here, mediators are also drawn from trusted people in other localities.`;
  }
  if (poolSize >= population) return `Mediators here are drawn from the verified, trusted people among the ${population} who live here.`;
  return `Mediators here are drawn from the ${poolSize} most trusted of the ${population} people who live here.`;
}

// The eligible pool, deterministically ordered (score desc, then id) so a
// logged draw can be recomputed exactly.
export async function keeperPool(options: { locality: string; exclude: string[] }) {
  const standings = await getStandingAll();
  const excludedIds = new Set(options.exclude);
  const eligibleEverywhere = [...standings.values()].filter(
    (standing) => standing.verified && standing.tier !== "newcomer" && !excludedIds.has(standing.user.id),
  );
  const byStandingThenId = (a: (typeof eligibleEverywhere)[number], b: (typeof eligibleEverywhere)[number]) =>
    b.score - a.score || (a.user.id < b.user.id ? -1 : 1);

  const eligibleHere = eligibleEverywhere.filter((standing) => standing.user.locality === options.locality).sort(byStandingThenId);
  const populationHere = [...standings.values()].filter((standing) => standing.user.locality === options.locality).length;

  // Prefer the locality's own pool. If it cannot seat a full panel, widen to
  // everyone eligible, sized for the whole membership.
  let pool = eligibleHere.slice(0, keeperPoolSize(populationHere));
  if (pool.length < KEEPERS_PER_CIRCLE) pool = eligibleEverywhere.sort(byStandingThenId).slice(0, keeperPoolSize(standings.size));
  return pool.map((standing) => ({ id: standing.user.id, username: standing.user.username }));
}

// Fill any empty mediator seats on a dispute, seeded by the public beacon, and
// append an audit entry. Safe to call repeatedly.
export async function fillKeepers(circleId: string) {
  const circle = await db.circle.findUnique({ where: { id: circleId } });
  if (!circle || (circle.status !== "OPEN" && circle.status !== "GATHERING")) return circle;

  // Step 1.
  const emptySeats = circle.keepersNeeded - circle.keeperIds.length;
  if (emptySeats <= 0) return circle;

  // Step 2.
  const cannotServe = [circle.raisedById, ...(circle.aboutId ? [circle.aboutId] : []), ...circle.keeperIds, ...circle.declinedKeeperIds];
  const pool = await keeperPool({ locality: circle.locality, exclude: cannotServe });
  if (!pool.length) return circle;

  // Steps 3 and 4.
  const beacon = await fetchBeacon();
  const seed = drawSeed(circle.id, beacon.randomness);
  const drawn = seededDraw(pool, emptySeats, seed);

  // Step 5.
  const auditLine = [
    new Date().toISOString(),
    `source=${beacon.source}`,
    beacon.source === "drand" ? `round=${beacon.round}` : `randomness=${beacon.randomness}`,
    `seed=${seed}`,
    `pool=${pool.map((member) => member.username).join(",")}`,
    `drew=${drawn.map((member) => member.username).join(",")}`,
  ].join(" ");

  return db.circle.update({
    where: { id: circleId },
    data: { keeperIds: { push: drawn.map((member) => member.id) }, status: "GATHERING", drawLog: { push: auditLine } },
  });
}
