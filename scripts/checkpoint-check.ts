// Portable ledger checkpoints: sign, export, verify off the underlying DB, and
// detect tampering in the bundle. Run: npm run smoke:checkpoint
import "./not-production";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { checkpointString, verifyExportedBundle, type LedgerBundle } from "../src/lib/checkpoint.shared";
import { GENESIS } from "../src/lib/hashlog";
import { db } from "../src/lib/db";

function assert(c: unknown, m: string) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok:", m); }
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function commons() {
  const seed = sha256(new TextEncoder().encode(`fw-voucher-key:${process.env.SESSION_SECRET}`));
  return { seed, pub: hex(ed25519.getPublicKey(seed)) };
}
function sign(msg: string, seed: Uint8Array) {
  return hex(ed25519.sign(new TextEncoder().encode(msg), seed));
}

async function main() {
  const { seed, pub } = commons();
  const rows = await db.ledgerLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const entries = rows.map((e) => ({ kind: e.kind, refId: e.refId, payloadHash: e.payloadHash, prevHash: e.prevHash, hash: e.hash, createdAt: e.createdAt.toISOString() }));
  const root = entries.length ? entries[entries.length - 1].hash : GENESIS;
  const at = new Date().toISOString();
  const sig = sign(checkpointString(root, entries.length, at), seed);
  const bundle: LedgerBundle = { version: 1, checkpoint: { root, count: entries.length, at, sig, pubKey: pub }, entries };

  assert(verifyExportedBundle(bundle).ok, `exported bundle verifies off-server (${entries.length} entries, root ${root.slice(0, 12)})`);

  // Tamper the signature.
  const badSig: LedgerBundle = { ...bundle, checkpoint: { ...bundle.checkpoint, sig: sig.replace(/^./, sig[0] === "a" ? "b" : "a") } };
  const vs = verifyExportedBundle(badSig);
  assert(!vs.ok && /signature/.test(vs.reason ?? ""), "a forged checkpoint signature is caught");

  // Tamper the count.
  const badCount: LedgerBundle = { ...bundle, checkpoint: { ...bundle.checkpoint, count: entries.length + 1 } };
  assert(!verifyExportedBundle(badCount).ok, "a mismatched entry count is caught");

  // Tamper an entry (if any), re-sign a matching checkpoint, and confirm the
  // chain re-derivation still catches the altered link.
  if (entries.length > 0) {
    const tampered = entries.map((e, i) => (i === 0 ? { ...e, payloadHash: "f".repeat(64) } : e));
    const b2: LedgerBundle = { version: 1, checkpoint: bundle.checkpoint, entries: tampered };
    const r2 = verifyExportedBundle(b2);
    assert(!r2.ok && r2.brokenAt === 0, "an altered entry breaks the chain at its position");
  } else {
    console.log("(no entries; chain-tamper check skipped)");
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
