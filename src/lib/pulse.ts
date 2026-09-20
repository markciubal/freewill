import { db } from "./db";

// The Trade Pulse: the running answer to "does trade here leave people better
// off?" Modeled on the classroom gains-from-trade experiment, where a class
// rates its satisfaction with randomly assigned items, trades freely, rates
// again, and the total rises. Here the endowments are whatever people already
// have; the board is the trading floor; this is the tally.
//
// Answers are one per person per settled exchange, private individually,
// public only as sums. They never affect standing: measuring welfare and
// scoring people must stay separate things.

export const DELTA_LABEL: Record<number, string> = {
  [-2]: "Much worse off",
  [-1]: "Worse off",
  [0]: "About the same",
  [1]: "Better off",
  [2]: "Much better off",
};
export const DELTAS = [2, 1, 0, -1, -2];

// Who may answer for a listing: the two parties to a settled exchange.
export function canReflect(
  listing: { status: string; ownerId: string; pledges: { userId: string; status: string }[] },
  userId: string,
): boolean {
  if (listing.status !== "FULFILLED") return false;
  if (listing.ownerId === userId) return true;
  return listing.pledges.some((p) => p.userId === userId && p.status === "COMPLETED");
}

export type Pulse = {
  allTime: { answers: number; sum: number };
  last30: { answers: number; sum: number; settled: number };
};

export async function getPulse(): Promise<Pulse> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [all, recent, settled] = await Promise.all([
    db.reflection.aggregate({ _count: true, _sum: { delta: true } }),
    db.reflection.aggregate({ where: { createdAt: { gte: since } }, _count: true, _sum: { delta: true } }),
    db.listing.count({ where: { status: "FULFILLED", fulfilledAt: { gte: since } } }),
  ]);
  return {
    allTime: { answers: all._count, sum: all._sum.delta ?? 0 },
    last30: { answers: recent._count, sum: recent._sum.delta ?? 0, settled },
  };
}

export const fmtSigned = (n: number) => (n > 0 ? `+${n}` : `${n}`);
