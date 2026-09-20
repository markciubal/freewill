import "server-only";
import { db } from "./db";
import { ledgerRoot } from "./hashlog";
import { commonsPublicKeyHex, signVoucher } from "./voucher";
import { type Checkpoint, type LedgerBundle, checkpointString } from "./checkpoint.shared";

export * from "./checkpoint.shared";

// Sign the current ledger root with the commons key. Publishing this over time
// (in a bulletin, on paper, anywhere) means the server cannot later present a
// different past than a checkpoint people already hold.
export async function signCheckpoint(): Promise<Checkpoint> {
  const { root, count } = await ledgerRoot();
  const at = new Date().toISOString();
  const sig = signVoucher(checkpointString(root, count, at));
  return { root, count, at, sig, pubKey: commonsPublicKeyHex() };
}

// The whole chain of hashes plus a signed checkpoint: a portable, off-server
// proof of the ledger's integrity. Does not include the underlying records,
// only the commitments, so it reveals nothing about who paid whom.
export async function exportLedger(): Promise<LedgerBundle> {
  const [entries, checkpoint] = await Promise.all([
    db.ledgerLog.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { kind: true, refId: true, payloadHash: true, prevHash: true, hash: true, createdAt: true },
    }),
    signCheckpoint(),
  ]);
  return {
    version: 1,
    checkpoint,
    entries: entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
  };
}
