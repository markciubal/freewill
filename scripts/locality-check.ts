// Locality normalization and case-insensitive matching. Guards the bug where
// the normalizer stripped letters and forced lowercase. Run: npm run smoke:locality
import "./not-production";
import { db } from "../src/lib/db";
import { localityKey, normalizeLocality } from "../src/lib/form";
import { getStandingAll } from "../src/lib/standing.all";

function assert(c: unknown, m: string) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok:", m); }

async function main() {
  // The old bug deleted every "s" and lowercased everything.
  assert(normalizeLocality("  Mississippi   McDonald ") === "Mississippi McDonald", "normalize keeps letters and capitals, collapses whitespace");
  assert(normalizeLocality("NYC") === "NYC", "uppercase preserved");
  assert(normalizeLocality("Côte d'Azur") === "Côte d'Azur", "accents and apostrophes preserved");
  assert(localityKey("North Ridge") === "north ridge", "key lowercases for matching");

  // Case-insensitive matching keeps preserved-capitalization localities together.
  const insensitive = await db.listing.count({ where: { locality: { equals: "north ridge", mode: "insensitive" } } });
  const exact = await db.listing.count({ where: { locality: "North Ridge" } });
  assert(insensitive === exact && exact > 0, `insensitive 'north ridge' matches 'North Ridge' (${insensitive} = ${exact})`);

  const all = await getStandingAll();
  assert(all.size > 0, `getStandingAll still computes (${all.size} people)`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
