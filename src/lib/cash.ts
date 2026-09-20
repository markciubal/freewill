import { sha256 } from "@noble/hashes/sha2.js";

// Cash: hash-commitment bearer notes. No signing key, no secret held by the
// system - only the commitment (a hash). The secret is generated in the
// holder's browser and written on paper; the commitment binds the denomination
// so a note cannot be re-valued. Everything here is pure and matches what the
// browser computes with WebCrypto over the identical string, so a note minted
// in one place verifies everywhere.

export const CASH_DENOMINATIONS = [1, 5, 10, 25, 50, 100] as const;
export type Denomination = (typeof CASH_DENOMINATIONS)[number];

export function isDenomination(n: number): n is Denomination {
  return (CASH_DENOMINATIONS as readonly number[]).includes(n);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// The exact string hashed for the commitment. The browser hashes the same
// string with crypto.subtle.digest("SHA-256", ...). Keep this in lockstep with
// the client mint code.
export function commitmentInput(denomination: number, secret: string): string {
  return `N1:${denomination}:${secret}`;
}

// Server-side commitment (browser uses WebCrypto; both hash commitmentInput).
export function commitmentOf(denomination: number, secret: string): string {
  return hex(sha256(new TextEncoder().encode(commitmentInput(denomination, secret))));
}

// The printable/writable note: denomination precedes the secret, as you asked.
export function noteToken(denomination: number, secret: string): string {
  return `N1.${denomination}.${secret}`;
}

export function parseNoteToken(token: string): { denomination: number; secret: string } | null {
  const m = token.trim().match(/^N1\.(\d{1,6})\.([0-9a-fA-F]{16,128})$/);
  if (!m) return null;
  const denomination = Number(m[1]);
  if (!isDenomination(denomination)) return null;
  return { denomination, secret: m[2].toLowerCase() };
}

export function isCommitment(s: string): boolean {
  return /^[0-9a-f]{64}$/i.test(s);
}
