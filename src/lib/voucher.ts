import "server-only";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { db } from "./db";
import { hex, voucherToken } from "./voucher.shared";

// The commons signing key. Derived deterministically from SESSION_SECRET, so
// there is no extra secret to manage: rotating SESSION_SECRET (which already
// logs everyone out) also retires every outstanding voucher. The server signs
// notes on a member's behalf and debits them up front; anyone verifies against
// the public key below. This is honest custody: the commons is the signer for
// now. Member-held keys (true self-custody) are Phase D.

export * from "./voucher.shared";

function signingSeed(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set");
  return sha256(new TextEncoder().encode(`fw-voucher-key:${secret}`)); // 32 bytes
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
