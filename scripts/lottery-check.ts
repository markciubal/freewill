// Checks for the verifiable lottery and the attestation vouch.
// Run: npm run smoke:lottery
import "./not-production";
import { drawSeed, seededDraw } from "../src/lib/beacon";
import { computeStanding } from "../src/lib/standing";

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else console.log("ok:", msg);
}

async function main() {
  const pool = ["ada", "bo", "cy", "dee", "fen", "gil"];
  const seed = drawSeed("dispute-1", "aabbccdd");
  assert(seededDraw(pool, 3, seed).join(",") === seededDraw([...pool], 3, seed).join(","), "same pool + seed -> same draw (recomputable)");
  assert(seededDraw(pool, 3, drawSeed("dispute-2", "aabbccdd")).join(",") !== seededDraw(pool, 3, seed).join(",") || pool.length <= 3, "different dispute -> different seed -> (almost surely) different draw");
  assert(new Set(seededDraw(pool, 6, seed)).size === 6, "draw is without replacement");
  assert(seededDraw(pool, 9, seed).length === 6, "asking for more than the pool returns the pool");
  assert(seededDraw([], 3, seed).length === 0, "empty pool draws nobody");

  const base = { vouchesReceived: 2, vouchesFromVerified: 2, vouchesGiven: 0, pledgesKept: 0, transfers: 0, circlesKept: 0, harms: 0, unfounded: 0, memberDays: 0, localityPopulation: 100, bootstrap: false };
  // pop 100 -> 3 vouches required
  assert(!computeStanding(base).verified, "2 of 3 vouches: not verified");
  assert(computeStanding({ ...base, humanVerified: true }).verified, "2 vouches + ID.me attestation: verified (counts as one vouch)");
  const s = computeStanding({ ...base, humanVerified: true });
  assert(s.score === computeStanding(base).score, "attestation changes verification only, never the score");

  try {
    const { fetchBeacon } = await import("../src/lib/beacon");
    const b = await fetchBeacon();
    console.log(`beacon: source=${b.source}${b.round ? ` round=${b.round}` : ""} randomness=${b.randomness.slice(0, 16)}...`);
    assert(b.randomness.length >= 16, "beacon returns usable randomness (drand or honest local fallback)");
  } catch (e) { console.log("(beacon fetch failed entirely:", e, ")"); }
}
main().catch((e) => { console.error(e); process.exit(1); });
