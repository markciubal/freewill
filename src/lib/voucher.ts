import "server-only";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { db } from "./db";
import { hex, voucherToken } from "./voucher.shared";

// The commons signing key: what signs vouchers and ledger checkpoints. It is
// derived from COMMONS_KEY_SEED so it can be kept stable while SESSION_SECRET
// rotates after a leak; rotating the seed itself retires every checkpoint and
// voucher signed before it. When COMMONS_KEY_SEED is unset the seed falls back
// to SESSION_SECRET, which keeps existing deployments' signatures valid. The
// server signs on a member's behalf and debits them up front; anyone verifies
// against the public key below. This is honest custody: the commons is the
// signer for the money ledger. Members hold their own keys for vouches.

export * from "./voucher.shared";

function signingSeed(): Uint8Array {
  const seed = process.env.COMMONS_KEY_SEED || process.env.SESSION_SECRET;
  if (!seed) throw new Error("COMMONS_KEY_SEED or SESSION_SECRET must be set");
  return sha256(new TextEncoder().encode(`fw-voucher-key:${seed}`)); // 32 bytes
}

export function commonsPublicKeyHex(): string {
  return hex(ed25519.getPublicKey(signingSeed()));
}

export function signVoucher(token: string): string {
  return hex(ed25519.sign(new TextEncoder().encode(token), signingSeed()));
}

export function signVoucherFields(v: { issuerId: string; ledger: "GRACE" | "HOURS"; amount: number; nonce: string }): string {
  return signVoucher(voucherToken(v));
}

// Total value sitting in unredeemed vouchers. The ledger's zero-sum invariant
// becomes: sum(balances) + demurrage remainder + outstanding vouchers == 0,
// because issuing debits the issuer before anyone has been credited.
export async function outstandingVouchers(): Promise<number> {
  const r = await db.voucher.aggregate({ where: { status: "ISSUED" }, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}
