import { sha256 } from "@noble/hashes/sha2.js";
import { z } from "zod";
import { checkpointString } from "./checkpoint.shared";
import { CATEGORIES } from "./covenant";
import { GENESIS, entryHash } from "./hashlog";
import { isPublicKey, verifyMessage, vouchToken } from "./keys";
import { SEED_CATEGORIES, SEED_FORMS } from "./seeds";
import { STANDING_RULES, requiredVouchesFor } from "./standing";
import { Work, type Worked } from "./worked";

// Other nodes: the pure half. A node is another community's own copy of
// Freewill, known by its node key, which is the same commons key that signs
// its ledger checkpoints. A node publishes a bundle (its open board, current
// notices, shared things, seeds, the signed vouches behind the people who wrote
// them, and its ledger history as hashes), signs it, and another node takes it
// in only when enough verified members there have trusted that key. Like a
// bank you trust: you check who they are once, then you accept what they sign.
//
// Nothing here touches the database, so every rule can be tested directly and
// run anywhere. The server half (building, fetching, storing) is federation.ts.

export const BUNDLE_FORMAT = "freewill-node-bundle";
export const BUNDLE_VERSION = 1;
// A bundle larger than this is refused before it is parsed.
export const BUNDLE_MAX_BYTES = 8 * 1024 * 1024;
// How far a signed request's clock may be from ours, and how far in the future
// a bundle's signed time may be, before it is refused.
export const CLOCK_SKEW_MINUTES = 5;
// Pins of published records are rounded to two decimals (about a kilometer)
// before they leave this node: enough to say how far away a well is, not
// enough to find the door of the person who posted it.
export const TRAVEL_PIN_DECIMALS = 2;
// The most of each kind a bundle may carry.
export const BUNDLE_LIMITS = { members: 5000, vouches: 20000, listings: 5000, bulletins: 2000, commons: 1000, seeds: 2000, ledgerEntries: 100000 } as const;

// The header names a node uses to prove who is asking for a bundle.
export const NODE_HEADER = "x-freewill-node";
export const TIME_HEADER = "x-freewill-time";
export const SIGNATURE_HEADER = "x-freewill-signature";

// ---------------------------------------------------------------------------
// Signed bytes
// ---------------------------------------------------------------------------

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function sha256Hex(s: string): string {
  return hex(sha256(new TextEncoder().encode(s)));
}

// One exact serialization of any JSON value: object keys sorted, no spaces.
// Signing this rather than whatever bytes happened to be sent means the check
// does not depend on how either side formats JSON. Keys whose value is
// undefined are left out, as JSON.stringify would.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

// What a node signs for a bundle: a fixed prefix, so the signature can never
// be mistaken for a checkpoint or a voucher, and the hash of everything in the
// bundle except the signature itself.
export function bundleMessage(unsigned: unknown): string {
  return `FWNODE1\u0000${sha256Hex(canonicalJson(unsigned))}`;
}

// What a node signs to ask another for its bundle. It names the node being
// asked (`audienceKey`), so the same request cannot be replayed to a third
// node, and a time, so it cannot be replayed later.
export function requestMessage(method: string, pathWithQuery: string, at: string, audienceKey: string): string {
  return `FWREQ1\u0000${method.toUpperCase()}\u0000${pathWithQuery}\u0000${at}\u0000${audienceKey.toLowerCase()}`;
}

export function withinClockSkew(at: string, now: Date): boolean {
  const t = Date.parse(at);
  return Number.isFinite(t) && Math.abs(now.getTime() - t) <= CLOCK_SKEW_MINUTES * 60_000;
}

// A stable fingerprint of one record, to tell whether it changed since the
// last bundle.
export function recordDigest(record: unknown): string {
  return sha256Hex(canonicalJson(record));
}

export function travelPin(lat: number | null | undefined, lng: number | null | undefined): { lat: number; lng: number } | null {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const f = 10 ** TRAVEL_PIN_DECIMALS;
  return { lat: Math.round(lat * f) / f, lng: Math.round(lng * f) / f };
}

// ---------------------------------------------------------------------------
// The bundle
// ---------------------------------------------------------------------------

// Ids are whatever the other node uses; they are only compared, never trusted
// as ids here.
const remoteId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const hash64 = z.string().regex(/^[0-9a-f]{64}$/);
const signature = z.string().regex(/^[0-9a-f]{128}$/);
const time = z.iso.datetime();
const text = (min: number, max: number) => z.string().min(min).max(max);
const pin = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable();
const category = z.enum(CATEGORIES as [string, ...string[]]);

const MemberSchema = z.object({ id: remoteId, username: text(1, 40), locality: text(1, 120), publicKey: hash64.nullable() });
const VouchSchema = z.object({ fromId: remoteId, toId: remoteId, signature });
const ListingSchema = z.object({
  id: remoteId,
  authorId: remoteId,
  kind: z.enum(["OFFER", "NEED"]),
  category,
  title: text(1, 200),
  description: text(0, 5000),
  quantity: text(0, 200).nullable(),
  wantsInReturn: text(0, 1000).nullable(),
  priceGrace: z.number().int().min(0).max(100_000_000).nullable(), // hundredths of that node's Grace
  priceHours: z.number().int().min(0).max(1_000_000).nullable(), // minutes
  locality: text(0, 120).nullable(),
  pin,
  status: z.enum(["OPEN", "MATCHED"]),
  createdAt: time,
});
const BulletinSchema = z.object({
  id: remoteId,
  authorId: remoteId,
  title: text(1, 200),
  body: text(0, 5000),
  level: z.enum(["INFO", "HAZARD", "URGENT"]),
  locality: text(0, 120).nullable(),
  pin,
  createdAt: time,
  expiresAt: time.nullable(),
});
const CommonsSchema = z.object({
  id: remoteId,
  authorId: remoteId, // the steward
  name: text(1, 200),
  description: text(0, 5000),
  category,
  rules: text(0, 5000).nullable(),
  locality: text(0, 120).nullable(),
  pin,
  available: z.boolean(),
  createdAt: time,
});
const SeedSchema = z.object({
  id: remoteId,
  authorId: remoteId, // the grower
  name: text(1, 200),
  form: z.enum(SEED_FORMS as [string, ...string[]]),
  category: z.enum(SEED_CATEGORIES as [string, ...string[]]),
  description: text(0, 5000),
  openPollinated: z.boolean().nullable(),
  quantity: text(0, 200).nullable(),
  daysToMaturity: z.number().int().min(0).max(2000).nullable(),
  sowMonths: z.array(z.number().int().min(1).max(12)).max(12),
  locality: text(0, 120).nullable(),
  pin,
  createdAt: time,
});

// Their ledger, as hashes only: the signed checkpoint and the payload hash of
// every entry from `from` on, with `prev` the chain hash just before `from`
// (the genesis constant when `from` is 0). Folding the hashes onto `prev` must
// give the signed root. Who paid whom never leaves the node.
const LedgerPartSchema = z.object({
  checkpoint: z.object({ root: hash64, count: z.number().int().min(0), at: time, sig: signature, pubKey: hash64 }),
  from: z.number().int().min(0),
  prev: hash64,
  payloadHashes: z.array(hash64).max(BUNDLE_LIMITS.ledgerEntries),
});

// Their books as they report them. A node can lie about these; the page says so.
const BooksSchema = z.object({
  people: z.number().int().min(0),
  balances: z.boolean(),
  graceTotal: z.number().int(), // hundredths, everything counted; zero when the books balance
  hoursTotal: z.number().int(), // minutes
});

export const NodeBundleSchema = z.object({
  format: z.literal(BUNDLE_FORMAT),
  version: z.literal(BUNDLE_VERSION),
  node: z.object({ publicKey: hash64 }),
  at: time,
  books: BooksSchema,
  members: z.array(MemberSchema).max(BUNDLE_LIMITS.members),
  vouches: z.array(VouchSchema).max(BUNDLE_LIMITS.vouches),
  listings: z.array(ListingSchema).max(BUNDLE_LIMITS.listings),
  bulletins: z.array(BulletinSchema).max(BUNDLE_LIMITS.bulletins),
  commons: z.array(CommonsSchema).max(BUNDLE_LIMITS.commons),
  seeds: z.array(SeedSchema).max(BUNDLE_LIMITS.seeds),
  ledger: LedgerPartSchema,
  sig: signature,
});

export type NodeBundle = z.infer<typeof NodeBundleSchema>;
export type UnsignedBundle = Omit<NodeBundle, "sig">;
export type BundleListing = z.infer<typeof ListingSchema>;
export type BundleBulletin = z.infer<typeof BulletinSchema>;
export type BundleCommons = z.infer<typeof CommonsSchema>;
export type BundleSeed = z.infer<typeof SeedSchema>;
export type BundleBooks = z.infer<typeof BooksSchema>;
export type BundleRecord = BundleListing | BundleBulletin | BundleCommons | BundleSeed;

export const RECORD_SCHEMAS = { LISTING: ListingSchema, BULLETIN: BulletinSchema, COMMONS: CommonsSchema, SEED: SeedSchema } as const;
export type PeerRecordKindName = keyof typeof RECORD_SCHEMAS;

// ---------------------------------------------------------------------------
// The ledger: does the new history carry the one we already held?
// ---------------------------------------------------------------------------

export type HeldCheckpoint = { root: string; count: number } | null;
export type LedgerCheck =
  | { ok: false; reason: string }
  | { ok: true; root: string; count: number; historyChanged: boolean };

export function checkLedgerPart(ledger: NodeBundle["ledger"], nodeKey: string, held: HeldCheckpoint): LedgerCheck {
  const cp = ledger.checkpoint;
  if (cp.pubKey !== nodeKey) return { ok: false, reason: "its ledger checkpoint is signed by a different key than the bundle" };
  if (!verifyMessage(checkpointString(cp.root, cp.count, cp.at), cp.sig, cp.pubKey)) return { ok: false, reason: "its ledger checkpoint signature does not check out" };
  if (ledger.from === 0 && ledger.prev !== GENESIS) return { ok: false, reason: "its ledger history does not start at the beginning" };
  if (ledger.from + ledger.payloadHashes.length !== cp.count) return { ok: false, reason: "its ledger history is not as long as its checkpoint says" };
  if (ledger.from > (held?.count ?? 0)) return { ok: false, reason: "its ledger history starts after the part this node holds, so the two cannot be lined up" };

  // Fold the hashes onto `prev`, noting the hash at the length we held.
  let hash = ledger.prev;
  let hashAtHeld: string | null = held && held.count === ledger.from ? ledger.prev : null;
  for (let i = 0; i < ledger.payloadHashes.length; i++) {
    hash = entryHash(hash, ledger.payloadHashes[i]);
    if (held && ledger.from + i + 1 === held.count) hashAtHeld = hash;
  }
  if (hash !== cp.root) return { ok: false, reason: "its ledger history does not lead to the root it signed" };

  // A history we cannot line up with what we held (it is shorter now, or the
  // entry where ours ended has a different hash) has been changed since.
  const historyChanged = !!held && held.count > 0 && hashAtHeld !== held.root;
  return { ok: true, root: cp.root, count: cp.count, historyChanged };
}

// ---------------------------------------------------------------------------
// Signed vouches: counted per person only when the signature checks out
// ---------------------------------------------------------------------------

export function countSignedVouches(members: NodeBundle["members"], vouches: NodeBundle["vouches"]) {
  const keyOf = new Map(members.map((m) => [m.id, m.publicKey]));
  const perMember = new Map<string, number>();
  const seen = new Set<string>();
  let valid = 0, invalid = 0, unknownKey = 0;
  // Verify before de-duplicating, so a forged copy of a pair listed first
  // cannot hide the real vouch after it.
  for (const v of vouches) {
    if (v.fromId === v.toId) continue;
    const key = keyOf.get(v.fromId);
    if (!key) { unknownKey++; continue; }
    if (!verifyMessage(vouchToken(v.fromId, v.toId), v.signature, key)) { invalid++; continue; }
    const pair = `${v.fromId}:${v.toId}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    valid++;
    perMember.set(v.toId, (perMember.get(v.toId) ?? 0) + 1);
  }
  return { valid, invalid, unknownKey, perMember };
}

// ---------------------------------------------------------------------------
// The whole check, before anything is stored
// ---------------------------------------------------------------------------

export type HeldState = { lastBundleAt: Date | null; checkpoint: HeldCheckpoint };
export type BundleVerdict =
  | { outcome: "refused"; reason: string }
  | { outcome: "stale"; reason: string; at: string }
  | {
      outcome: "accepted";
      bundle: NodeBundle;
      ledger: { root: string; count: number; historyChanged: boolean };
      vouches: ReturnType<typeof countSignedVouches>;
    };

// `raw` is the parsed JSON exactly as it arrived. The signature is checked
// over that, not over the validated copy, so fields this version does not know
// about are still covered by the signature (and then ignored).
export function checkBundle(raw: unknown, peerKey: string, held: HeldState, now: Date): BundleVerdict {
  const parsed = NodeBundleSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { outcome: "refused", reason: `it is not a bundle this node can read (${issue.path.join(".") || "the whole file"} is not as expected)` };
  }
  const bundle = parsed.data;
  if (bundle.node.publicKey !== peerKey.toLowerCase()) return { outcome: "refused", reason: "it is signed by a different node" };

  const unsigned = { ...(raw as Record<string, unknown>) };
  delete unsigned.sig;
  if (!verifyMessage(bundleMessage(unsigned), bundle.sig, bundle.node.publicKey)) {
    return { outcome: "refused", reason: "its signature does not check out, so it was changed after it was signed or was not signed by that node" };
  }
  if (Date.parse(bundle.at) > now.getTime() + CLOCK_SKEW_MINUTES * 60_000) {
    return { outcome: "refused", reason: "it is dated in the future, so one of the two clocks is wrong" };
  }
  if (held.lastBundleAt && Date.parse(bundle.at) <= held.lastBundleAt.getTime()) {
    return { outcome: "stale", reason: "this node already has that bundle or a newer one", at: bundle.at };
  }
  const ledger = checkLedgerPart(bundle.ledger, bundle.node.publicKey, held.checkpoint);
  if (!ledger.ok) return { outcome: "refused", reason: ledger.reason };

  return {
    outcome: "accepted",
    bundle,
    ledger: { root: ledger.root, count: ledger.count, historyChanged: ledger.historyChanged },
    vouches: countSignedVouches(bundle.members, bundle.vouches),
  };
}

// ---------------------------------------------------------------------------
// Trust: when does this node take in another?
// ---------------------------------------------------------------------------

// Counted like verification: verified members' trust, against the same
// square-root rule, applied to the number of verified members on this node.
// Nobody decides alone once the node is past a handful of people, and nobody
// can decide for everyone by holding an office, because there is none.
export function peerTrustWithWork(input: { verifiedTrusters: number; allTrusters: number; verifiedMembersHere: number }): { trusted: boolean; required: number; worked: Worked } {
  const work = new Work();
  const { divisor, atLeast, atMost } = STANDING_RULES.requiredVouches;
  const required = work.step(
    "Trust needed to take in another node",
    { verifiedMembersHere: input.verifiedMembersHere },
    `round(sqrt(${input.verifiedMembersHere}) / ${divisor}), kept between ${atLeast} and ${atMost}`,
    requiredVouchesFor(input.verifiedMembersHere),
    "The same rule as vouches for a person, counted over everyone verified on this node, so a big node needs more people to agree without ever needing more than seven.",
  );
  const counted = work.step(
    "Trust that counts",
    { membersWhoTrustIt: input.allTrusters, ofThemVerified: input.verifiedTrusters },
    `only the ${input.verifiedTrusters} verified members count`,
    input.verifiedTrusters,
    "Only verified members can trust another node, for the same reason only they can vouch: a ring of new accounts cannot open the door.",
  );
  const trusted = work.step(
    "Taken in?",
    { counted, required },
    `${counted} >= ${required}`,
    counted >= required,
    "While this is no, nothing that node sends is stored here and nothing of ours is sent to it.",
  );
  return { trusted, required, worked: { title: "Trust in this node", source: "src/lib/federation.shared.ts", steps: work.steps, result: trusted ? "trusted" : "not yet" } };
}

// The trust count as a sentence that agrees in number at every size.
export function trustSentence(counted: number, required: number): string {
  const needed = `${required} ${required === 1 ? "is" : "are"} needed`;
  if (counted === 0) return `Not trusted by any verified member yet; ${needed}.`;
  const who = `Trusted by ${counted} verified ${counted === 1 ? "member" : "members"}`;
  return counted < required ? `${who}; ${needed}.` : `${who}, and ${needed}, so it is taken in.`;
}

// ---------------------------------------------------------------------------
// Where a node may be fetched from
// ---------------------------------------------------------------------------

// This server fetches the address members give it, so the address must not
// point back inside the network it runs on. On a public server: https only, no
// names for the local machine or network, no private or reserved addresses
// written as numbers. The server also checks what the name resolves to just
// before it fetches (federation.ts). `allowLocal` is for development, where two
// nodes on one laptop talk over http://localhost.
export function peerUrlProblem(raw: string, opts: { allowLocal: boolean }): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "That address is not a web address. It should look like https://their-node.example.";
  }
  if (url.protocol !== "https:" && !(opts.allowLocal && url.protocol === "http:")) return "The address must start with https://.";
  if (url.username || url.password) return "The address must not carry a name or password.";
  if (url.search || url.hash) return "Give only the node's address, with nothing after a ? or #.";
  if (!opts.allowLocal && !publicHost(url.hostname)) return "That address points inside a private network, which this server will not fetch from.";
  return null;
}

export function normalizePeerUrl(raw: string): string {
  const url = new URL(raw.trim());
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function publicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host.startsWith("[")) return false; // single-label names and IPv6 literals
  if (/(^|\.)(localhost|local|internal|lan|home|intranet|corp)$/.test(host)) return false;
  if (/^[\d.]+$/.test(host)) return isPublicIPv4(host);
  return true;
}

// Private, loopback, link-local, carrier-grade NAT, and other reserved ranges.
export function isPublicIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

// IPv6: only global unicast (2000::/3) counts as public, minus the documentation range.
export function isPublicIPv6(address: string): boolean {
  const a = address.toLowerCase();
  if (a.startsWith("::ffff:")) return isPublicIPv4(a.slice(7));
  return /^[23][0-9a-f]{0,3}:/.test(a) && !a.startsWith("2001:db8");
}

export function isNodeKey(s: string): boolean {
  return isPublicKey(s);
}

export { GENESIS };
