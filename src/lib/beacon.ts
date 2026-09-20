import { createHash } from "node:crypto";

// Public randomness for the mediator lottery. The seed comes from the drand
// beacon (the League of Entropy: distributed, free, and its rounds are signed
// and public), so a draw can be recomputed by anyone from the dispute id and
// the round number. When the beacon is unreachable the draw falls back to
// local randomness and says so in the audit log; fairness then rests on the
// operator, exactly as it did before, but never silently.

const ENDPOINTS = ["https://api.drand.sh", "https://drand.cloudflare.com", "https://api2.drand.sh"];

export type BeaconValue = { source: "drand" | "local"; round: number | null; randomness: string };

export async function fetchBeacon(): Promise<BeaconValue> {
  for (const base of ENDPOINTS) {
    try {
      const r = await fetch(`${base}/public/latest`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
      if (!r.ok) continue;
      const j = (await r.json()) as { round?: number; randomness?: string };
      if (typeof j.round === "number" && typeof j.randomness === "string" && /^[0-9a-f]{16,}$/i.test(j.randomness)) {
        return { source: "drand", round: j.round, randomness: j.randomness };
      }
    } catch {
      // try the next mirror
    }
  }
  const { randomBytes } = await import("node:crypto");
  return { source: "local", round: null, randomness: randomBytes(32).toString("hex") };
}

// seed = sha256("<disputeId>:<beacon randomness>"), hex.
export function drawSeed(disputeId: string, randomness: string) {
  return createHash("sha256").update(`${disputeId}:${randomness}`).digest("hex");
}

// Deterministic draw without replacement: index i comes from
// sha256("<seed>:<i>") over the remaining bag. Given the same ordered pool and
// seed, the same members come out, so a logged draw is checkable by hand.
export function seededDraw<T>(pool: T[], count: number, seed: string): T[] {
  const bag = [...pool];
  const out: T[] = [];
  let i = 0;
  while (out.length < count && bag.length) {
    const h = createHash("sha256").update(`${seed}:${i++}`).digest();
    out.push(bag.splice(h.readUInt32BE(0) % bag.length, 1)[0]);
  }
  return out;
}
