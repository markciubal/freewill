import { ed25519 } from "@noble/curves/ed25519.js";

// Member-held identity keys. The private key is generated on the member's own
// device and never sent to the server; only the public key is registered. A
// member signs their own vouches, so authorship is unforgeable (a Sabul cannot
// claim your endorsement) and any other node can verify the web of trust
// without trusting the server (breaking the wall between isolated communities).
// Everything here is pure and runs in the browser or on the server.

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function fromHex(s: string): Uint8Array {
  const clean = s.trim().toLowerCase().replace(/[^0-9a-f]/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function isPublicKey(s: string): boolean {
  return /^[0-9a-f]{64}$/i.test(s.trim());
}
export function isPrivateKey(s: string): boolean {
  return /^[0-9a-f]{64}$/i.test(s.trim());
}

// Generate a fresh identity keypair on the device. The private key is the
// 32-byte Ed25519 seed; keep it secret, back it up, lose it and it is gone.
export function generateIdentity(): { privateKey: string; publicKey: string } {
  const priv = ed25519.utils.randomSecretKey();
  return { privateKey: hex(priv), publicKey: hex(ed25519.getPublicKey(priv)) };
}

export function publicKeyOf(privateKeyHex: string): string {
  return hex(ed25519.getPublicKey(fromHex(privateKeyHex)));
}

// The exact bytes a member signs to endorse someone. Binding from and to means
// the signature is a vouch by `from` for `to`, and nothing else.
export function vouchToken(fromId: string, toId: string): string {
  return `FWVOUCH1\u0000${fromId}\u0000${toId}`;
}

export function signMessage(privateKeyHex: string, message: string): string {
  return hex(ed25519.sign(new TextEncoder().encode(message), fromHex(privateKeyHex)));
}

export function verifyMessage(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    return ed25519.verify(fromHex(signatureHex), new TextEncoder().encode(message), fromHex(publicKeyHex));
  } catch {
    return false;
  }
}

// A short, human-checkable fingerprint of a public key, for display.
export function keyFingerprint(publicKeyHex: string): string {
  const h = publicKeyHex.trim().toLowerCase();
  return `${h.slice(0, 8)} ${h.slice(8, 16)}`;
}

// A portable snapshot of the web of trust: members' public keys and the signed
// vouches between them. Another community can download this and verify every
// signed vouch itself, with only the public keys — no need to trust the server
// that served it. This is what makes federation across isolated nodes safe.
export type TrustBundle = {
  version: number;
  members: { id: string; username: string; publicKey: string }[];
  vouches: { fromId: string; toId: string; signature: string }[];
};

export type TrustVerification = { members: number; vouches: number; valid: number; invalid: number; unknownKey: number };

export function verifyTrustBundle(b: TrustBundle): TrustVerification {
  const keyOf = new Map(b.members.map((m) => [m.id, m.publicKey]));
  let valid = 0, invalid = 0, unknownKey = 0;
  for (const v of b.vouches) {
    const pub = keyOf.get(v.fromId);
    if (!pub) { unknownKey++; continue; }
    if (verifyMessage(vouchToken(v.fromId, v.toId), v.signature, pub)) valid++;
    else invalid++;
  }
  return { members: b.members.length, vouches: b.vouches.length, valid, invalid, unknownKey };
}
