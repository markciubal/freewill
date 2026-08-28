// Apply demurrage now. Usage: npx tsx --env-file=.env scripts/demurrage.ts [--force] [--days N]
import { db } from "../src/lib/db";
import { maybeRunDemurrage } from "../src/lib/demurrage";

async function main() {
  const force = process.argv.includes("--force");
  const di = process.argv.indexOf("--days");
  const days = di >= 0 ? Number(process.argv[di + 1]) : undefined;
  const run = await maybeRunDemurrage({ force, days });
  console.log(run ? run : "Nothing to do: interval has not elapsed. Use --force to run anyway.");
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
