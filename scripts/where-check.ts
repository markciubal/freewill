// A MongoDB quirk that has bitten twice: a field that was never written is not
// the same as a field holding null, and a filter for null matches only the
// second. Prisma leaves an empty optional field out of the document, so a
// naive "expiresAt: null" never finds a notice with no expiry, and a naive
// "appliedAt: null" never finds a question waiting to be carried out.
// These checks hold the shared filters to the real database, read-only.
// Run: npm run smoke:where
import { NOT_YET_APPLIED } from "../src/lib/commons.data";
import { db } from "../src/lib/db";
import { postedEverywhere, stillCurrent } from "../src/lib/where";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

async function main() {
  // The shape of the filters themselves.
  const current = stillCurrent(new Date("2026-01-01T00:00:00Z"));
  assert(Array.isArray(current.OR) && current.OR.length === 3, "a current notice is one with no expiry (null), no expiry (never written), or an expiry still ahead");
  assert(JSON.stringify(current.OR).includes('"isSet":false'), "the never-written case is asked for explicitly");
  assert(postedEverywhere.length === 2 && JSON.stringify(postedEverywhere).includes('"isSet":false'), "a notice posted everywhere is found whether its locality is null or was never written");
  assert(JSON.stringify(NOT_YET_APPLIED).includes('"isSet":false'), "a question waiting to be carried out is found whether appliedAt is null or was never written");

  try {
    const now = new Date();
    const all = await db.bulletin.findMany({ select: { id: true, expiresAt: true } });
    const shouldShow = all.filter((bulletin) => bulletin.expiresAt === null || bulletin.expiresAt > now).map((bulletin) => bulletin.id).sort();
    const shown = (await db.bulletin.findMany({ where: stillCurrent(now), select: { id: true } })).map((bulletin) => bulletin.id).sort();
    assert(JSON.stringify(shown) === JSON.stringify(shouldShow), `every current notice is found by the filter (${shown.length} of ${shouldShow.length}), including the ${all.filter((bulletin) => bulletin.expiresAt === null).length} with no expiry`);

    const naive = await db.bulletin.count({ where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } });
    if (naive < shown.length) console.log(`   (the naive null filter would have hidden ${shown.length - naive} of them: this is the bug the shared filter exists to prevent)`);

    const waiting = await db.proposal.count({ where: { commonsId: { isSet: true }, ...NOT_YET_APPLIED } });
    const waitingByHand = (await db.proposal.findMany({ select: { commonsId: true, appliedAt: true } })).filter((question) => question.commonsId && !question.appliedAt).length;
    assert(waiting === waitingByHand, `questions about shared things that are still waiting are all found (${waiting})`);
    await db.$disconnect();
  } catch (error) {
    console.log("(dev DB not reachable; skipped live checks)", (error as Error).message.split("\n")[0]);
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
