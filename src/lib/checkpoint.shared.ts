import { entryHash, GENESIS } from "./hashlog";
import { verifyVoucherSig } from "./voucher.shared";

// Portable ledger checkpoints: the next phase of the tamper-evident ledger.
// A checkpoint is the current Merkle root, entry count, and time, signed by the
// commons key. Exported with the chain of hashes, it lets anyone verify the
// whole history off-server with nothing but the public key - the groundwork for
// carrying the ledger onto another node, a USB stick, or a mesh, and for
// anchoring roots publicly so the past cannot be quietly rewritten.

export type Checkpoint = { root: string; count: number; at: string; sig: string; pubKey: string };
export type LedgerEntry = { kind: string; refId: string; payloadHash: string; prevHash: string; hash: string; createdAt: string };
export type LedgerBundle = { version: number; checkpoint: Checkpoint; entries: LedgerEntry[] };

export function checkpointString(root: string, count: number, at: string): string {
  return `FWCK1\u0000${root}\u0000${count}\u0000${at}`;
}

export function verifyCheckpointSig(cp: Checkpoint): boolean {
  return verifyVoucherSig(checkpointString(cp.root, cp.count, cp.at), cp.sig, cp.pubKey);
}

export type BundleVerification = { ok: boolean; count: number; root: string; brokenAt: number | null; reason?: string };

// Re-derive the chain from the exported hashes alone, confirm it produces the
// signed root, and check the signature. No database needed: this runs anywhere.
export function verifyExportedBundle(bundle: LedgerBundle): BundleVerification {
  const { checkpoint: cp, entries } = bundle;
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.prevHash !== prev || entryHash(prev, e.payloadHash) !== e.hash) {
      return { ok: false, count: entries.length, root: prev, brokenAt: i, reason: "the chain link was altered" };
    }
    prev = e.hash;
  }
  if (prev !== cp.root || entries.length !== cp.count) {
    return { ok: false, count: entries.length, root: prev, brokenAt: null, reason: "the chain does not match the signed root" };
  }
  if (!verifyCheckpointSig(cp)) {
    return { ok: false, count: entries.length, root: prev, brokenAt: null, reason: "the checkpoint signature does not check out" };
  }
  return { ok: true, count: entries.length, root: prev, brokenAt: null };
}
