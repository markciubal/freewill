// Wind-down report math against the live dev DB (read-only). Run: npm run smoke:jubilee
import { db } from "../src/lib/db";
import { windDownReport } from "../src/lib/jubilee";

function assert(c: unknown, m: string) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok:", m); }

async function main() {
  const r = await windDownReport();
  assert(r.balances, "the books net to zero (debt forgiven == claims released, incl. remainder + vouchers)");
  assert(r.graceDebtForgiven >= 0 && r.gracePositiveReleased >= 0, "forgiven and released amounts are non-negative");
  // Grace: positive released == debt forgiven + remainder + outstanding vouchers (zero-sum identity)
  const bal = await db.user.aggregate({ _sum: { graceBalance: true } });
  assert((bal._sum.graceBalance ?? 0) === r.gracePositiveReleased - r.graceDebtForgiven, "positive minus debt equals the net Grace balance");
  console.log(`report: ${r.members} members, ${r.graceDebtForgiven} Grace debt would be forgiven, ${r.commons} commons remain, ${r.openDisputes} disputes open`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
