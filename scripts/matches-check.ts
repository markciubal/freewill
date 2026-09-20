// Unit checks for the match finder (pure logic; no database writes), then a
// read-only spot check against the dev DB if it is reachable.
// Run: npm run smoke:matches
import { computeMatches, type OpenListing } from "../src/lib/matches";

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else console.log("ok:", msg);
}

let n = 0;
const L = (kind: "OFFER" | "NEED", category: string, ownerId: string, opts: Partial<OpenListing> = {}): OpenListing => ({
  id: `l${++n}`, kind, category: category as OpenListing["category"], title: `${kind} ${category} ${n}`,
  ownerId, locality: "Testville", lat: 44.0, lng: -121.0, createdAt: new Date(2026, 0, n),
  owner: { username: ownerId }, ...opts,
});

const me = { lat: 44.0, lng: -121.0, locality: "Testville" };

async function main() {
  // Counterpart: my NEED FOOD matches their OFFER FOOD, not their NEED FOOD.
  const m1 = computeMatches([L("NEED", "FOOD", "me")], [L("OFFER", "FOOD", "ada"), L("NEED", "FOOD", "bo"), L("OFFER", "TOOLS", "cy")], me);
  assert(m1.counterparts.length === 1 && m1.counterparts[0].theirs.ownerId === "ada", "counterpart matches opposite kind, same category only");
  assert(m1.reciprocals.length === 0, "one-way match is not a reciprocal");

  // Reciprocal: I offer TOOLS and need FOOD; dee offers FOOD and needs TOOLS.
  const mine2 = [L("OFFER", "TOOLS", "me"), L("NEED", "FOOD", "me")];
  const others2 = [L("NEED", "TOOLS", "dee"), L("OFFER", "FOOD", "dee"), L("OFFER", "FOOD", "eli")];
  const m2 = computeMatches(mine2, others2, me);
  assert(m2.reciprocals.length === 1 && m2.reciprocals[0].other.username === "dee", "reciprocal pair detected for dee only");
  assert(m2.reciprocals[0].myOffer.category === "TOOLS" && m2.reciprocals[0].theirOffer.category === "FOOD", "reciprocal pairs the right listings");

  // Reach: far away and different locality is excluded; far but same locality stays.
  const far = { lat: 45.0, lng: -121.0 };
  const m3 = computeMatches([L("NEED", "FOOD", "me")], [
    L("OFFER", "FOOD", "far-stranger", { ...far, locality: "Elsewhere" }),
    L("OFFER", "FOOD", "far-local", { ...far, locality: "Testville" }),
  ], me);
  assert(m3.counterparts.length === 1 && m3.counterparts[0].theirs.ownerId === "far-local", "reach = same locality or within 10 km");

  // Ranking: nearest counterpart first, capped per listing.
  const m4 = computeMatches([L("NEED", "FOOD", "me")], [
    L("OFFER", "FOOD", "far", { lat: 44.05 }), L("OFFER", "FOOD", "near", { lat: 44.001 }),
    L("OFFER", "FOOD", "a"), L("OFFER", "FOOD", "b"), L("OFFER", "FOOD", "c"), L("OFFER", "FOOD", "d"),
  ], me);
  assert(m4.counterparts[0].theirs.ownerId !== "far" && m4.counterparts.length === 4, "nearest first, capped at 4 per listing");

  assert(computeMatches([], [L("OFFER", "FOOD", "x")], me).total === 0, "no own listings, no matches");

  // Read-only DB spot check (seed: dee NEEDs ENERGY firewood; bo OFFERs ENERGY solar repair).
  try {
    const { db } = await import("../src/lib/db");
    const { findMatchesForUser } = await import("../src/lib/matches");
    const dee = await db.user.findUnique({ where: { username: "dee" } });
    if (dee) {
      const m = await findMatchesForUser(dee);
      const hit = m.counterparts.find((c) => c.theirs.owner.username === "bo" && c.theirs.category === "ENERGY");
      assert(hit, `dev DB: dee's firewood need matches bo's solar/energy offer (${m.total} total matches)`);
    } else console.log("(dev DB has no seed user; skipping spot check)");
    await db.$disconnect();
  } catch {
    console.log("(dev DB not reachable; pure-logic checks only)");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
