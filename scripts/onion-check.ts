// The onion address, checked without Tor: the address is a key and its
// checksum catches typos, onion visits are told apart from the open internet,
// and the app does not break itself over Tor's plain http.
// Run: npm run smoke:onion   (no database, no network)
import "./not-production";
import { ed25519 } from "@noble/curves/ed25519.js";
import { publicOrigin } from "../src/lib/idme.shared";
import { arrivedByOnion, isOnionV3, onionAddressFor, onionHostname, onionLocation } from "../src/lib/onion";
import { ONION_ADDRESS_KEY, RATE_LIMITS, addressLimit, buildContentSecurityPolicy } from "../src/lib/security";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

// 1. The address is the key.
const publicKey = ed25519.getPublicKey(ed25519.utils.randomSecretKey());
const address = onionAddressFor(publicKey);
assert(address.length === 62 && isOnionV3(address), `a fresh key makes a valid 56-character address (${address.slice(0, 12)}...onion)`);
// Two long-standing public onion services, as published by their owners.
const published = ["duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion", "2gzyxa5ihm7nsggfxnu52rck2vv4rvmdlkiu3zzui5du4xyclen53wid.onion"];
assert(published.every(isOnionV3), "real published addresses (DuckDuckGo, the Tor Project) pass the checksum");
const typo = (text: string) => (text[3] === "a" ? `${text.slice(0, 3)}b${text.slice(4)}` : `${text.slice(0, 3)}a${text.slice(4)}`);
assert(!published.some((known) => isOnionV3(typo(known))) && !isOnionV3(typo(address)), "one wrong character fails the checksum, so a typo in the configured address is caught");
assert(!isOnionV3("facebookcorewwwi.onion") && !isOnionV3("example.com") && !isOnionV3(`${address.slice(0, 55)}.onion`), "old v2 addresses, ordinary domains and short addresses are refused");

// 2. Configuration.
assert(onionHostname({ ONION_HOSTNAME: `  http://${address.toUpperCase()}/ ` }) === address, "ONION_HOSTNAME is accepted with or without http:// and a trailing slash, in any case");
assert(onionHostname({ ONION_HOSTNAME: typo(address) }) === null && onionHostname({}) === null, "a mistyped or missing ONION_HOSTNAME turns the onion features off rather than pointing anywhere");

// 3. Telling an onion visit apart.
assert(arrivedByOnion({ host: address, forwardedFor: null }, address), "a request handed over by Tor (onion Host, no X-Forwarded-For) is an onion visit");
assert(arrivedByOnion({ host: address, forwardedFor: "127.0.0.1" }, address) && arrivedByOnion({ host: address, forwardedFor: "::1" }, address) && arrivedByOnion({ host: address, forwardedFor: "::ffff:127.0.0.1" }, address), "the loopback address Next.js fills in for Tor on this machine still counts as an onion visit");
assert(arrivedByOnion({ host: `${address.toUpperCase()}:80`, forwardedFor: null }, address), "the port and letter case of the Host header do not matter");
assert(!arrivedByOnion({ host: address, forwardedFor: "203.0.113.9" }, address), "an onion Host that came through a web host or proxy is not believed");
assert(!arrivedByOnion({ host: address, forwardedFor: "127.0.0.1, 203.0.113.9" }, address), "a stranger who forges X-Forwarded-For: 127.0.0.1 through a proxy still carries their real address, and is not believed");
assert(!arrivedByOnion({ host: "freewill.example", forwardedFor: null }, address) && !arrivedByOnion({ host: address, forwardedFor: null }, null), "the regular address, or no onion address configured, is not an onion visit");

// 4. The app does not break itself over Tor's plain http.
const csp = (plainHttp: boolean) => buildContentSecurityPolicy({ nonce: "n", isDevelopment: false, tileOrigin: null, mapDataOrigin: null, plainHttp });
assert(csp(false).includes("upgrade-insecure-requests") && !csp(true).includes("upgrade-insecure-requests"), "the regular site upgrades insecure requests; the onion site does not, or every script would be sent to https://...onion and fail");
assert(csp(true).includes("'strict-dynamic'") && csp(true).includes("frame-ancestors 'none'"), "the onion site keeps the same script and framing protections");
assert(onionLocation(address, "/board?kind=NEED") === `http://${address}/board?kind=NEED`, "Onion-Location points Tor Browser at the same page on the onion address");
assert(publicOrigin(new Request(`http://localhost:3000/api/idme/start`, { headers: { host: address } })) === `http://${address}`, "a redirect built for an onion visit stays on the onion address instead of jumping to the regular site");

// 5. Throttling. Every onion visitor reaches the app from the same place, so
// per-address limits would lock them all out together. They share one bucket
// with its own, wider limits; the per-username login limit still protects
// every account in full.
assert(addressLimit(ONION_ADDRESS_KEY, "loginPerAddress").max > RATE_LIMITS.loginPerAddress.max && addressLimit(ONION_ADDRESS_KEY, "joinPerAddress").max > RATE_LIMITS.joinPerAddress.max, "onion visitors share a wider bucket, not one person's allowance");
assert(addressLimit("ip:203.0.113.9", "loginPerAddress") === RATE_LIMITS.loginPerAddress, "a regular visitor keeps the ordinary per-address limits");
