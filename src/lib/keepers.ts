import { db } from "./db";
import { getStandingAll } from "./standing.all";

// Keepers are chosen by lot, not by volunteering. The pool is the highest
// standing verified people in the circle's locality. It starts at about five
// per hundred and grows with the square root of the population, so keeping
// circles slowly becomes a craft held by fewer people per head, the way it does
// in any society that lasts.

export function keeperPoolSize(population: number) {
  return Math.max(3, Math.ceil(5 * Math.sqrt(Math.max(population, 1) / 100)));
}

export const KEEPERS_PER_CIRCLE = 3;

export async function drawKeepers(opts: { locality: string; exclude: string[]; needed: number }): Promise<string[]> {
  const all = await getStandingAll();
  const excluded = new Set(opts.exclude);
  const eligible = [...all.values()].filter((s) => s.verified && s.tier !== "newcomer" && !excluded.has(s.user.id));
  const local = eligible.filter((s) => s.user.locality === opts.locality);
  const localPop = [...all.values()].filter((s) => s.user.locality === opts.locality).length;

  // Prefer the local pool; widen to everyone only if it cannot fill the draw.
  let pool = local.sort((a, b) => b.score - a.score).slice(0, keeperPoolSize(localPop));
  if (pool.length < opts.needed) pool = eligible.sort((a, b) => b.score - a.score).slice(0, keeperPoolSize(all.size));

  const drawn: string[] = [];
  const bag = [...pool];
  while (drawn.length < opts.needed && bag.length) {
    const i = Math.floor(Math.random() * bag.length);
    drawn.push(bag.splice(i, 1)[0].user.id);
  }
  return drawn;
}

// Fill any empty keeper seats on a circle. Safe to call repeatedly.
export async function fillKeepers(circleId: string) {
  const c = await db.circle.findUnique({ where: { id: circleId } });
  if (!c || (c.status !== "OPEN" && c.status !== "GATHERING")) return c;
  const short = c.keepersNeeded - c.keeperIds.length;
  if (short <= 0) return c;
  const exclude = [c.raisedById, ...(c.aboutId ? [c.aboutId] : []), ...c.keeperIds, ...c.declinedKeeperIds];
  const drawn = await drawKeepers({ locality: c.locality, exclude, needed: short });
  if (!drawn.length) return c;
  return db.circle.update({
    where: { id: circleId },
    data: { keeperIds: { push: drawn }, status: "GATHERING" },
  });
}
