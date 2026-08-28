// Sanity checks for the instant-runoff tally and the keeper lot. Run: npx tsx --env-file=.env scripts/rcv-check.ts
import { db } from "../src/lib/db";
import { drawKeepers, keeperPoolSize } from "../src/lib/keepers";
import { tallyIRV } from "../src/lib/rcv";
import { applyNear, haversineKm, roundPin } from "../src/lib/geo";
import { requiredVouchesFor } from "../src/lib/standing";

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else console.log("ok:", msg);
}

async function main() {
  // Classic IRV: A leads first choices but B wins after C is eliminated.
  const ballots = [[0, 1], [0, 1], [0, 1], [0, 1], [1, 0], [1, 0], [1, 0], [2, 1], [2, 1], [2, 1]];
  const t = tallyIRV(3, ballots);
  assert(t.rounds[0].counts.join(",") === "4,3,3", `round 1 counts 4,3,3 (got ${t.rounds[0].counts})`);
  assert(t.rounds[0].eliminated === 2, "C eliminated first");
  assert(t.winner === 1, `B wins on transfers (got ${t.winner})`);
  assert(tallyIRV(2, [[0], [0], [1]]).winner === 0, "simple majority wins in one round");
  assert(tallyIRV(2, []).winner === null, "no ballots, no winner");
  assert(tallyIRV(3, [[0], [1], [2]]).rounds.length >= 2, "three-way tie goes to more rounds");

  assert(requiredVouchesFor(5) === 1 && requiredVouchesFor(100) === 3 && requiredVouchesFor(10000) === 7, "vouch threshold: 1 at 5, 3 at 100, capped at 7");
  assert(keeperPoolSize(100) === 5 && keeperPoolSize(10000) === 50, "keeper pool: 5 per 100, 50 per 10000");

  const d = haversineKm({ lat: 40.7128, lng: -74.006 }, { lat: 51.5074, lng: -0.1278 });
  assert(Math.abs(d - 5570) < 30, `NYC to London ~5570 km (got ${Math.round(d)})`);
  const rp = roundPin({ lat: 44.3123456, lng: -121.1839999 });
  assert(rp.lat === 44.312 && rp.lng === -121.184, "pins round to 3 decimals");
  const me = { lat: 44.27, lng: -121.2 };
  const near = applyNear([{ lat: 44.271, lng: -121.212, n: "close" }, { lat: 44.5, lng: -121.2, n: "far" }, { lat: null, lng: null, n: "nopin" }], me, "near");
  assert(near.length === 1 && near[0].n === "close", "near keeps only pinned items within 10 km");
  assert(applyNear([{ lat: null, lng: null, n: "nopin" }], me, "all").length === 1, "all keeps unpinned items");

  const flats = await db.user.findMany({ where: { locality: "River Flats" }, select: { id: true, username: true } });
  const dee = flats.find((u) => u.username === "dee")!;
  const drawn = await drawKeepers({ locality: "River Flats", exclude: [dee.id], needed: 3 });
  const names = await db.user.findMany({ where: { id: { in: drawn } }, select: { username: true } });
  console.log("drawn keepers for a circle raised by dee:", names.map((n) => n.username).join(", "));
  assert(drawn.length > 0 && !drawn.includes(dee.id), "lot excludes the raiser and draws someone");
  assert(!names.some((n) => n.username === "eli"), "unverified eli is never drawn");
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
