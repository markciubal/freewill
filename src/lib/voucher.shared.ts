import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { Ledger } from "@prisma/client";

// Pure voucher crypto: no secret, so it can be tested and could run in a
// browser to verify a note offline. The secret-holding signer lives in
// voucher.ts behind "server-only".

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function fromHex(s: string): Uint8Array {
  const clean = s.trim().toLowerCase();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function newNonce(): string {
  return hex(ed25519.utils.randomSecretKey().slice(0, 16));
}

// The exact bytes the commons signs and anyone re-derives to verify. Fixed
// order, versioned, so a note minted today verifies years from now.
export function voucherToken(v: { issuerId: string; ledger: Ledger; amount: number; nonce: string }): string {
  return `FWV1\u0000${v.issuerId}\u0000${v.ledger}\u0000${v.amount}\u0000${v.nonce}`;
}

export function verifyVoucherSig(token: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    return ed25519.verify(fromHex(signatureHex), new TextEncoder().encode(token), fromHex(publicKeyHex));
  } catch {
    return false;
  }
}

// The compact string printed on the note (and encoded as a QR). Carries
// everything a verifier needs except the commons public key, which is public.
export type NoteFields = { issuerId: string; issuerName: string; ledger: Ledger; amount: number; nonce: string; sig: string };

export function encodeNote(f: NoteFields): string {
  const json = JSON.stringify([f.issuerId, f.issuerName, f.ledger, f.amount, f.nonce, f.sig]);
  return "FWV1." + Buffer.from(json, "utf8").toString("base64url");
}

export function decodeNote(s: string): NoteFields | null {
  try {
    const body = s.trim().replace(/^FWV1\./, "");
    const a = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!Array.isArray(a) || a.length !== 6) return null;
    const [issuerId, issuerName, ledger, amount, nonce, sig] = a;
    if (typeof issuerId !== "string" || (ledger !== "GRACE" && ledger !== "HOURS")) return null;
    if (!Number.isInteger(amount) || amount <= 0 || typeof nonce !== "string" || typeof sig !== "string") return null;
    return { issuerId, issuerName: String(issuerName ?? ""), ledger, amount, nonce, sig };
  } catch {
    return null;
  }
}

export function noteFingerprint(token: string): string {
  return hex(sha256(new TextEncoder().encode(token))).slice(0, 8);
}
