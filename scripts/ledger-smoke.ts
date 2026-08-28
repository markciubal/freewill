// Exercises the mutual-credit ledger against the real DB: zero-sum, limits, rejection.
// Run: npx tsx --env-file=.env scripts/ledger-smoke.ts   (needs seed data)
import { db } from "../src/lib/db";
import { LedgerError, transfer } from "../src/lib/ledger";
import { latestRun, maybeRunDemurrage } from "../src/lib/demurrage";
import { getStanding } from "../src/lib/standing.all";

async function sums() {
  const [a, run] = await Promise.all([db.user.aggregate({ _sum: { graceBalance: true, hoursBalance: true } }), latestRun()]);
  return { grace: (a._sum.graceBalance ?? 0) + (run?.remainder ?? 0), hours: a._sum.hoursBalance ?? 0 };
}
function assert(cond: unknown, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else console.log("ok:", msg);
}

async function main() {
const eli = await db.user.findUniqueOrThrow({ where: { username: "eli" } });
const ada = await db.user.findUniqueOrThrow({ where: { username: "ada" } });
const before = await sums();
assert(before.grace === 0 && before.hours === 0, `ledgers sum to zero before (${JSON.stringify(before)})`);

const s = await getStanding(eli.id);
console.log(`eli: ${s.tier} ${s.score}pts, verified ${s.verified} (${s.vouchesReceived}/${s.requiredVouches}), graceLimit ${s.graceLimit}, harms ${s.harms}, allowance ${s.circleAllowance}`);
const ada0 = await getStanding(ada.id);
assert(ada0.verified && ada0.graceLimit > 0, `ada is verified with credit (limit ${ada0.graceLimit})`);

// Demurrage: force a 30-day run and check zero-sum including the carried remainder.
await maybeRunDemurrage();
const run = await maybeRunDemurrage({ force: true, days: 30 });
console.log(`demurrage: decayed ${run?.totalDecayed} among ${run?.members} verified, dividend ${run?.dividend}, remainder ${run?.remainder}`);
const afterDemurrage = await sums();
assert(afterDemurrage.grace === 0, "zero-sum holds after demurrage (with carried remainder)");

const t = await transfer({ ledger: "GRACE", fromId: ada.id, toId: eli.id, amount: 5, memo: "smoke" });
const mid = await sums();
assert(mid.grace === 0, "zero-sum holds after a transfer");

let rejected = false;
try { await transfer({ ledger: "GRACE", fromId: eli.id, toId: ada.id, amount: 10_000 }); } catch (e) { rejected = e instanceof LedgerError; }
assert(rejected, "over-limit transfer rejected");
rejected = false;
try { await transfer({ ledger: "GRACE", fromId: eli.id, toId: eli.id, amount: 1 }); } catch (e) { rejected = e instanceof LedgerError; }
assert(rejected, "self-payment rejected");

// undo the smoke transfer
await db.$transaction([
  db.user.update({ where: { id: ada.id }, data: { graceBalance: { increment: 5 } } }),
  db.user.update({ where: { id: eli.id }, data: { graceBalance: { decrement: 5 } } }),
  db.transfer.delete({ where: { id: t.id } }),
]);
const after = await sums();
assert(after.grace === 0 && after.hours === 0, "ledgers sum to zero after cleanup");
await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
