// Voucher crypto (pure) plus a live economics round-trip against the dev DB
// that cleans up after itself. Run: npm run smoke:voucher
import "./not-production";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { db } from "../src/lib/db";
import { appendLog, verifyLedger } from "../src/lib/hashlog";
import { decodeNote, encodeNote, hex, newNonce, verifyVoucherSig, voucherToken } from "../src/lib/voucher.shared";

function assert(c: unknown, m: string) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok:", m); }

// Replicates the server's commons key derivation so the script can sign like it.
function commonsKey() {
  const seed = sha256(new TextEncoder().encode(`fw-voucher-key:${process.env.SESSION_SECRET}`));
  return { seed, pub: hex(ed25519.getPublicKey(seed)) };
}
function sign(token: string, seed: Uint8Array) {
  return hex(ed25519.sign(new TextEncoder().encode(token), seed));
}

async function main() {
  const { seed, pub } = commonsKey();

  // --- Pure crypto ---
  const fields = { issuerId: "abc", ledger: "GRACE" as const, amount: 25, nonce: newNonce() };
  const token = voucherToken(fields);
  const sig = sign(token, seed);
  assert(verifyVoucherSig(token, sig, pub), "valid signature verifies");
  assert(!verifyVoucherSig(voucherToken({ ...fields, amount: 26 }), sig, pub), "tampered amount fails verification");
  const otherPub = hex(ed25519.getPublicKey(ed25519.utils.randomSecretKey()));
  assert(!verifyVoucherSig(token, sig, otherPub), "wrong public key fails");

  const note = encodeNote({ ...fields, issuerName: "ada", sig });
  const decoded = decodeNote(note);
  assert(decoded?.nonce === fields.nonce && decoded?.amount === 25, "note encodes and decodes");
  assert(decodeNote("garbage") === null && decodeNote("FWV1.zzzz") === null, "garbage notes rejected");

  // --- Live economics round-trip (issue -> redeem -> double-spend), then teardown ---
  const ada = await db.user.findUnique({ where: { username: "ada" } });
  const bo = await db.user.findUnique({ where: { username: "bo" } });
  if (!ada || !bo) { console.log("(no seed users; skipping live economics)"); await db.$disconnect(); return; }

  const sums = async () => {
    const bal = await db.user.aggregate({ _sum: { graceBalance: true } });
    const out = await db.voucher.aggregate({ where: { status: "ISSUED" }, _sum: { amount: true } });
    const run = await db.demurrageRun.findFirst({ orderBy: { ranAt: "desc" } });
    return (bal._sum.graceBalance ?? 0) + (out._sum.amount ?? 0) + (run?.remainder ?? 0);
  };
  const amount = 3;
  assert((await sums()) === 0, "zero-sum before (balances + outstanding + remainder)");

  // ISSUE
  const nonce = newNonce();
  const vSig = sign(voucherToken({ issuerId: ada.id, ledger: "GRACE", amount, nonce }), seed);
  const vId = await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: ada.id }, data: { graceBalance: { decrement: amount } } });
    const v = await tx.voucher.create({ data: { issuerId: ada.id, ledger: "GRACE", amount, nonce, signature: vSig } });
    await appendLog(tx, "VOUCHER_ISSUE", v.id, v as unknown as Record<string, unknown>);
    return v.id;
  });
  assert((await sums()) === 0, "zero-sum holds after issue (amount moved into the note)");

  // REDEEM by bo
  await db.$transaction(async (tx) => {
    const v = await tx.voucher.findUniqueOrThrow({ where: { nonce } });
    assert(v.status === "ISSUED", "note is spendable once");
    await tx.user.update({ where: { id: bo.id }, data: { graceBalance: { increment: v.amount } } });
    const upd = await tx.voucher.update({ where: { id: v.id }, data: { status: "REDEEMED", redeemedById: bo.id, redeemedAt: new Date() } });
    await appendLog(tx, "VOUCHER_REDEEM", upd.id, upd as unknown as Record<string, unknown>);
  });
  assert((await sums()) === 0, "zero-sum holds after redeem");

  // DOUBLE-SPEND attempt
  const again = await db.voucher.findUnique({ where: { nonce } });
  assert(again?.status === "REDEEMED", "second presentation sees REDEEMED and would be refused");

  const chain = await verifyLedger();
  assert(chain.ok, "hash chain still verifies with the two voucher events");

  // Teardown: reverse balances and remove the test rows (the two log entries are
  // the chain tail, so removing them restores the prior root).
  await db.$transaction([
    db.user.update({ where: { id: ada.id }, data: { graceBalance: { increment: amount } } }),
    db.user.update({ where: { id: bo.id }, data: { graceBalance: { decrement: amount } } }),
    db.ledgerLog.deleteMany({ where: { refId: vId } }),
    db.voucher.delete({ where: { id: vId } }),
  ]);
  assert((await sums()) === 0 && (await verifyLedger()).ok, "cleaned up: zero-sum and chain intact");
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
