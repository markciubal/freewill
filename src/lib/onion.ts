import { sha3_256 } from "@noble/hashes/sha3.js";

// The app's onion address: a second way in, through Tor, that hides members'
// network addresses from this server and from anyone watching the network.
// Pure, so every rule here can be checked without Tor running (smoke:onion).
//
// An onion address is not a name someone rents; it IS a public key. A v3
// address is 56 characters of base32 spelling out 35 bytes:
//
//   32 bytes  the service's Ed25519 public key
//    2 bytes  a checksum: SHA3-256(".onion checksum" | key | version), first two bytes
//    1 byte   the version, 3
//
// So nobody can issue, seize or reassign it the way a domain can be taken at
// a registrar, and Tor checks that whoever answers holds the matching private
// key. Losing that private key loses the address for good; anyone who copies it
// can impersonate the service. See docs/onion.md.
//
// How a request arrives: the Tor daemon beside the app hands each onion visit
// straight to the app's port, as a plain HTTP request with Host set to the
// onion address and coming from this machine itself (every hop was inside
// Tor, so there is no visitor address to report). Tor already encrypts end to end, which is why
// onion services use http://, and why this app must not upgrade those requests
// to https or it would break itself.

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
const ONION_V3 = /^[a-z2-7]{56}\.onion$/;
const VERSION = 3;

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Uint8Array {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of text) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

function checksum(publicKey: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(".onion checksum");
  return sha3_256(Uint8Array.from([...prefix, ...publicKey, VERSION])).slice(0, 2);
}

// The v3 onion address that belongs to an Ed25519 public key.
export function onionAddressFor(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) throw new Error("An onion address is made from a 32-byte Ed25519 public key.");
  return `${base32Encode(Uint8Array.from([...publicKey, ...checksum(publicKey), VERSION]))}.onion`;
}

// A well-formed v3 onion address whose checksum is right, so a typo in the
// configured address is caught here instead of sending visitors nowhere.
export function isOnionV3(address: string): boolean {
  if (!ONION_V3.test(address)) return false;
  const bytes = base32Decode(address.slice(0, 56));
  if (bytes.length !== 35 || bytes[34] !== VERSION) return false;
  const expected = checksum(bytes.slice(0, 32));
  return bytes[32] === expected[0] && bytes[33] === expected[1];
}

// The configured onion address (ONION_HOSTNAME), tidied, or null when there is
// none or it is not a valid v3 address. Accepts "abc...xyz.onion", with or
// without "http://" and a trailing slash.
export function onionHostname(env: Record<string, string | undefined>): string | null {
  const raw = env.ONION_HOSTNAME?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return raw && isOnionV3(raw) ? raw : null;
}

// Whether a request came in through the onion service: addressed to the onion
// address, and handed over by Tor on this same machine. Tor sends no
// X-Forwarded-For; Next.js then fills it in with the connection's own address,
// which for Tor on this machine is loopback (127.x.x.x or ::1). A web host or
// reverse proxy appends the visitor's real address to the header, so a
// stranger claiming the onion address from the open internet, even one who
// sends "X-Forwarded-For: 127.0.0.1" themselves, ends up with a public address
// in the chain and is not believed. This holds as long as the app's own port
// is reachable only through the proxy and Tor (next start -H 127.0.0.1).
const LOOPBACK = /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

export function onlyThisMachine(forwardedFor: string | null): boolean {
  if (!forwardedFor || !forwardedFor.trim()) return true;
  return forwardedFor.split(",").every((hop) => LOOPBACK.test(hop.trim()));
}

export function arrivedByOnion(request: { host: string | null; forwardedFor: string | null }, onionHost: string | null): boolean {
  if (!onionHost || !request.host || !onlyThisMachine(request.forwardedFor)) return false;
  return request.host.trim().toLowerCase().replace(/:\d+$/, "") === onionHost;
}

// The Onion-Location header value for a page on the regular address: Tor
// Browser offers to switch to the same page at the onion address.
export function onionLocation(onionHost: string, pathAndQuery: string): string {
  return `http://${onionHost}${pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`}`;
}
