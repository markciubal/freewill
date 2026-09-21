// Cash (hash-commitment bearer notes): pure hashing + a live mint/reclaim
// round-trip with teardown. Run: npm run smoke:cash
import "./not-production";
import { createHash } from "node:crypto";
import { commitmentInput, commitmentOf, denominationCents, isCommitment, noteToken, parseNoteToken } from "../src/lib/cash";
import { db } from "../src/lib/db";
import { appendLog, verifyLedger } from "../src/lib/hashlog";

function assert(c: unknown, m: string) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok:", m); }

async function main() {
  // The server commitment is plain SHA-256 of the canonical string, so the
  // browser (WebCrypto SHA-256 of the same string) computes an identical hash.
  const ref = createHash("sha256").update(commitmentInput(10, "deadbeef")).digest("hex");
  assert(commitmentOf(10, "deadbeef") === ref, "commitment is standard SHA-256 of the canonical string (browser will match)");
  assert(commitmentOf(10, "a") !== commitmentOf(5, "a"), "denomination is bound into the commitment");
  assert(commitmentOf(10, "a") !== commitmentOf(10, "b"), "different secret, different commitment");
  assert(isCommitment(commitmentOf(10, "a")), "commitment is 64 hex");

  const tok = noteToken(25, "ABCDEF0123456789");
  const parsed = parseNoteToken(tok);
  assert(parsed?.denomination === 25 && parsed.secret === "abcdef0123456789", "note token round-trips (secret lowercased)");
  assert(parseNoteToken("N1.7.abc") === null, "bad denomination rejected");
  assert(parseNoteToken("nonsense") === null, "garbage rejected");

  // Live economics.
  const ada = await db.user.findUnique({ where: { username: "ada" } });
  const bo = await db.user.findUnique({ where: { username: "bo" } });
  if (!ada || !bo) { console.log("(no seed users; skipping live economics)"); await db.$disconnect(); return; }

  const sums = async () => {
    const bal = await db.user.aggregate({ _sum: { graceBalance: true } });
    const vou = await db.voucher.aggregate({ where: { status: "ISSUED" }, _sum: { amount: true } });
    const cash = await db.cashNote.aggregate({ where: { status: "LOCKED" }, _sum: { denomination: true } });
    const run = await db.demurrageRun.findFirst({ orderBy: { ranAt: "desc" } });
    // Grace is cents; cash denominations are whole Grace, so ×100.
    return (bal._sum.graceBalance ?? 0) + (vou._sum.amount ?? 0) + (cash._sum.denomination ?? 0) * 100 + (run?.remainder ?? 0);
  };
  assert((await sums()) === 0, "zero-sum before");

  const secret = "cafebabecafebabecafebabecafebabe";
  const denom = 10; // whole Grace note
  const cents = denominationCents(denom);
  const commitment = commitmentOf(denom, secret);

  // MINT (server only ever sees the commitment)
  const noteId = await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: ada.id }, data: { graceBalance: { decrement: cents } } });
    const n = await tx.cashNote.create({ data: { minterId: ada.id, ledger: "GRACE", denomination: denom, commitment } });
    await appendLog(tx, "CASH_MINT", n.id, n as unknown as Record<string, unknown>);
    return n.id;
  });
  assert((await sums()) === 0, "zero-sum holds after mint (value locked into the note)");

  // RECLAIM by bo (reveals secret; server hashes and matches)
  const token = noteToken(denom, secret);
  const p = parseNoteToken(token)!;
  await db.$transaction(async (tx) => {
    const n = await tx.cashNote.findUniqueOrThrow({ where: { commitment: commitmentOf(p.denomination, p.secret) } });
    assert(n.status === "LOCKED", "note is reclaimable once");
    await tx.user.update({ where: { id: bo.id }, data: { graceBalance: { increment: denominationCents(n.denomination) } } });
    const s = await tx.cashNote.update({ where: { id: n.id }, data: { status: "SPENT", spentById: bo.id, spentAt: new Date() } });
    await appendLog(tx, "CASH_REDEEM", s.id, s as unknown as Record<string, unknown>);
  });
  assert((await sums()) === 0, "zero-sum holds after reclaim");

  const again = await db.cashNote.findUnique({ where: { commitment } });
  assert(again?.status === "SPENT", "a copy revealed afterward sees SPENT and is refused");
  assert((await verifyLedger()).ok, "hash chain still verifies with the cash events");

  // Teardown.
  await db.$transaction([
    db.user.update({ where: { id: ada.id }, data: { graceBalance: { increment: cents } } }),
    db.user.update({ where: { id: bo.id }, data: { graceBalance: { decrement: cents } } }),
    db.ledgerLog.deleteMany({ where: { refId: noteId } }),
    db.cashNote.delete({ where: { id: noteId } }),
  ]);
  assert((await sums()) === 0 && (await verifyLedger()).ok, "cleaned up: zero-sum and chain intact");
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
