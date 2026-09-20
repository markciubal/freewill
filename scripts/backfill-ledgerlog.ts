// Append hash-chain entries for any transfers/adjustments not yet logged.
// Additive and idempotent. Run: npx tsx --env-file=.env scripts/backfill-ledgerlog.ts
import { db } from "../src/lib/db";
import { backfillLog, verifyLedger } from "../src/lib/hashlog";

async function main() {
  const { added } = await backfillLog();
  const v = await verifyLedger();
  console.log(`backfilled ${added} entries; chain now ${v.count} entries, ok=${v.ok}, root=${v.root.slice(0, 16)}...`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
