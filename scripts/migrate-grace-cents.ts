// Forward migration: decimalize Grace to hundredths (cents). Scales every
// stored Grace amount by 100 and re-derives the ledger hash chain in place so
// nothing is lost and the chain stays valid. Idempotent: guarded by a Migration
// record. Run once per database:  npx tsx --env-file=.env scripts/migrate-grace-cents.ts
//
// It refuses a database that already recorded Grace in hundredths (anything
// created since the change; see src/lib/grace-cents.ts), because scaling that
// again would multiply real balances by 100. For such a database, record the
// migration as done without touching any amount:
//   npx tsx --env-file=.env scripts/migrate-grace-cents.ts --mark-applied
import { db } from "../src/lib/db";
import { GRACE_IN_HUNDREDTHS_SINCE, whyNotScale } from "../src/lib/grace-cents";
import { GENESIS, entryHash, payloadHashOf, type LogKind } from "../src/lib/hashlog";

const NAME = "grace-cents";

async function fetchRecord(kind: string, refId: string) {
  if (kind === "TRANSFER") return db.transfer.findUnique({ where: { id: refId } });
  if (kind === "ADJUSTMENT") return db.ledgerAdjustment.findUnique({ where: { id: refId } });
  if (kind === "VOUCHER_ISSUE" || kind === "VOUCHER_REDEEM") return db.voucher.findUnique({ where: { id: refId } });
  if (kind === "CASH_MINT" || kind === "CASH_REDEEM") return db.cashNote.findUnique({ where: { id: refId } });
  return null;
}

async function main() {
  const already = await db.migration.findUnique({ where: { name: NAME } });
  if (already) {
    console.log(`Migration "${NAME}" already applied ${already.appliedAt.toISOString()}; nothing to do.`);
    await db.$disconnect();
    return;
  }

  // Only a database whose Grace was all written in whole units may be scaled.
  const since = { gte: GRACE_IN_HUNDREDTHS_SINCE };
  const reason = whyNotScale({
    transfers: await db.transfer.count({ where: { ledger: "GRACE", createdAt: since } }),
    adjustments: await db.ledgerAdjustment.count({ where: { ledger: "GRACE", createdAt: since } }),
    vouchers: await db.voucher.count({ where: { ledger: "GRACE", createdAt: since } }),
    cashNotes: await db.cashNote.count({ where: { createdAt: since } }),
    listingsWithGraceAsk: await db.listing.count({ where: { priceGrace: { gt: 0 }, createdAt: since } }),
    demurrageRunsThatMelted: await db.demurrageRun.count({ where: { totalDecayed: { gt: 0 }, ranAt: since } }),
  });
  if (process.argv.includes("--mark-applied")) {
    if (!reason) {
      console.error("Refusing --mark-applied: nothing here was written in hundredths yet, so this database may still hold whole Grace. Run the migration without the flag.");
      process.exit(1);
    }
    await db.migration.create({ data: { name: NAME } });
    console.log(`Recorded "${NAME}" as applied without changing any amount: ${reason}.`);
    await db.$disconnect();
    return;
  }
  if (reason) {
    console.error(`Refusing to scale: ${reason}.`);
    console.error("If every amount here is already in hundredths, record the migration as done with --mark-applied. If the database holds a mix, a person has to look before anything is changed.");
    process.exit(1);
  }

  // Scale every Grace amount by 100. Cash denominations stay whole Grace.
  const scaled = {
    balances: (await db.user.updateMany({ data: { graceBalance: { multiply: 100 } } })).count,
    transfers: (await db.transfer.updateMany({ where: { ledger: "GRACE" }, data: { amount: { multiply: 100 } } })).count,
    adjustments: (await db.ledgerAdjustment.updateMany({ where: { ledger: "GRACE" }, data: { amount: { multiply: 100 } } })).count,
    vouchers: (await db.voucher.updateMany({ where: { ledger: "GRACE" }, data: { amount: { multiply: 100 } } })).count,
    listings: (await db.listing.updateMany({ where: { priceGrace: { not: null } }, data: { priceGrace: { multiply: 100 } } })).count,
    demurrage: (await db.demurrageRun.updateMany({ data: { remainder: { multiply: 100 }, dividend: { multiply: 100 }, totalDecayed: { multiply: 100 } } })).count,
  };

  // Re-derive the ledger hash chain from the now-scaled records, in order.
  const logs = await db.ledgerLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  let prevHash = GENESIS;
  for (const e of logs) {
    const rec = await fetchRecord(e.kind, e.refId);
    if (!rec) throw new Error(`Ledger log ${e.id} references a missing ${e.kind} ${e.refId}; aborting before any chain write.`);
    const payloadHash = payloadHashOf(e.kind as LogKind, rec as Record<string, unknown>);
    const hash = entryHash(prevHash, payloadHash);
    await db.ledgerLog.update({ where: { id: e.id }, data: { payloadHash, prevHash, hash } });
    prevHash = hash;
  }

  await db.migration.create({ data: { name: NAME } });
  console.log("Migrated Grace to cents:", JSON.stringify(scaled), `| re-chained ${logs.length} ledger entries; root ${prevHash.slice(0, 16)}`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
