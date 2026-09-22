import "server-only";
import { lookup } from "node:dns/promises";
import type { Peer, PeerRecordKind, Prisma } from "@prisma/client";
import { checkpointString } from "./checkpoint.shared";
import { db } from "./db";
import { explainZeroSum, zeroSumParts } from "./explain";
import { GENESIS } from "./hashlog";
import { verifyMessage } from "./keys";
import { getStandingAll } from "./standing.all";
import { commonsPublicKeyHex, signVoucher } from "./voucher";
import { stillCurrent } from "./where";
import type { Worked } from "./worked";
import {
  BUNDLE_FORMAT,
  BUNDLE_LIMITS,
  BUNDLE_MAX_BYTES,
  BUNDLE_VERSION,
  NODE_HEADER,
  RECORD_SCHEMAS,
  SIGNATURE_HEADER,
  TIME_HEADER,
  bundleMessage,
  checkBundle,
  isNodeKey,
  isPublicIPv4,
  isPublicIPv6,
  peerTrustWithWork,
  peerUrlProblem,
  recordDigest,
  requestMessage,
  travelPin,
  withinClockSkew,
  type BundleBulletin,
  type BundleCommons,
  type BundleListing,
  type BundleRecord,
  type BundleSeed,
  type NodeBundle,
  type PeerRecordKindName,
  type UnsignedBundle,
} from "./federation.shared";

export * from "./federation.shared";

// Other nodes: the server half. This node's key is the commons key: the one
// that already signs its ledger checkpoints, so a peer that trusts this key
// checks our bundles and our ledger against the same one.

export function nodePublicKey(): string {
  return commonsPublicKeyHex();
}
const signWithNodeKey = signVoucher;

// On a public server the fetch rules are strict; in development two nodes on
// one machine may talk over http://localhost.
const allowLocal = () => process.env.NODE_ENV !== "production";

// A peer's rows that are still in its latest bundle (see where.ts on why null
// and never-written both have to be asked for).
const current = { OR: [{ goneAt: null }, { goneAt: { isSet: false } }] };

// ---------------------------------------------------------------------------
// This node's bundle
// ---------------------------------------------------------------------------

// Everything a trusted node may see, signed: the open board, current notices,
// shared things, available seeds; the people who wrote them and the signed
// vouches for those people; the ledger as hashes from `from` on; and the books
// as totals. Nobody's balance, trades, disputes, votes or map pin travels.
export async function buildNodeBundle(opts: { from?: number } = {}): Promise<NodeBundle> {
  const now = new Date();
  const [listings, bulletins, commons, seeds, logs, parts, people] = await Promise.all([
    db.listing.findMany({ where: { status: { in: ["OPEN", "MATCHED"] } }, orderBy: { createdAt: "desc" }, take: BUNDLE_LIMITS.listings }),
    db.bulletin.findMany({ where: stillCurrent(now), orderBy: { createdAt: "desc" }, take: BUNDLE_LIMITS.bulletins }),
    db.commons.findMany({ orderBy: { createdAt: "desc" }, take: BUNDLE_LIMITS.commons }),
    db.seedShare.findMany({ where: { available: true }, orderBy: { createdAt: "desc" }, take: BUNDLE_LIMITS.seeds }),
    db.ledgerLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { payloadHash: true, hash: true } }),
    zeroSumParts(),
    db.user.count(),
  ]);

  const authorIds = [...new Set([...listings.map((l) => l.ownerId), ...bulletins.map((b) => b.authorId), ...commons.map((c) => c.stewardId), ...seeds.map((s) => s.stewardId)])];
  const vouches = await db.vouch.findMany({ where: { toId: { in: authorIds }, signature: { not: null } }, select: { fromId: true, toId: true, signature: true }, take: BUNDLE_LIMITS.vouches });
  const memberIds = [...new Set([...authorIds, ...vouches.map((v) => v.fromId)])];
  const members = await db.user.findMany({ where: { id: { in: memberIds } }, select: { id: true, username: true, locality: true, publicKey: true } });

  // The ledger, as hashes: `prev` is the chain hash just before `from`.
  const count = logs.length;
  const root = count ? logs[count - 1].hash : GENESIS;
  const from = Number.isInteger(opts.from) && opts.from! > 0 && opts.from! <= count ? opts.from! : 0;
  const at = now.toISOString();
  const zero = explainZeroSum(parts);

  const unsigned: UnsignedBundle = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    node: { publicKey: nodePublicKey() },
    at,
    books: {
      people,
      balances: zero.balances,
      graceTotal: parts.graceBalances + parts.carriedRemainder + parts.reservedInVouchers + parts.lockedInCash,
      hoursTotal: parts.hoursBalances,
    },
    members: members.map((m) => ({ id: m.id, username: m.username, locality: m.locality, publicKey: m.publicKey ?? null })),
    vouches: vouches.map((v) => ({ fromId: v.fromId, toId: v.toId, signature: v.signature! })),
    listings: listings.map((l) => ({
      id: l.id,
      authorId: l.ownerId,
      kind: l.kind,
      category: l.category,
      title: l.title,
      description: l.description,
      quantity: l.quantity ?? null,
      wantsInReturn: l.wantsInReturn ?? null,
      priceGrace: l.priceGrace ?? null,
      priceHours: l.priceHours ?? null,
      locality: l.locality ?? null,
      pin: travelPin(l.lat, l.lng),
      status: l.status as "OPEN" | "MATCHED",
      createdAt: l.createdAt.toISOString(),
    })),
    bulletins: bulletins.map((b) => ({
      id: b.id,
      authorId: b.authorId,
      title: b.title,
      body: b.body,
      level: b.level,
      locality: b.locality ?? null,
      pin: b.locality ? travelPin(b.lat, b.lng) : null,
      createdAt: b.createdAt.toISOString(),
      expiresAt: b.expiresAt ? b.expiresAt.toISOString() : null,
    })),
    commons: commons.map((c) => ({
      id: c.id,
      authorId: c.stewardId,
      name: c.name,
      description: c.description,
      category: c.category,
      rules: c.rules ?? null,
      locality: c.locality ?? null,
      pin: travelPin(c.lat, c.lng),
      available: c.available,
      createdAt: c.createdAt.toISOString(),
    })),
    seeds: seeds.map((s) => ({
      id: s.id,
      authorId: s.stewardId,
      name: s.name,
      form: s.form,
      category: s.category,
      description: s.description,
      openPollinated: s.openPollinated ?? null,
      quantity: s.quantity ?? null,
      daysToMaturity: s.daysToMaturity ?? null,
      sowMonths: s.sowMonths,
      locality: s.locality ?? null,
      pin: travelPin(s.lat, s.lng),
      createdAt: s.createdAt.toISOString(),
    })),
    ledger: {
      checkpoint: { root, count, at, sig: signWithNodeKey(checkpointString(root, count, at)), pubKey: nodePublicKey() },
      from,
      prev: from > 0 ? logs[from - 1].hash : GENESIS,
      payloadHashes: logs.slice(from).map((l) => l.payloadHash),
    },
  };
  return { ...unsigned, sig: signWithNodeKey(bundleMessage(unsigned)) };
}

// ---------------------------------------------------------------------------
// Trust
// ---------------------------------------------------------------------------

export type PeerTrustState = { trusted: boolean; required: number; trusterIds: string[]; verifiedTrusterIds: string[]; worked: Worked };

// Trust in every peer, from live standing: only verified members count, and
// the threshold follows the number of verified members here.
export async function peerTrustAll(): Promise<Map<string, PeerTrustState>> {
  const [peers, rows, standings] = await Promise.all([
    db.peer.findMany({ select: { id: true } }),
    db.peerTrust.findMany({ select: { peerId: true, userId: true }, orderBy: { createdAt: "asc" } }),
    getStandingAll(),
  ]);
  const verified = new Set([...standings].filter(([, s]) => s.verified).map(([id]) => id));
  const out = new Map<string, PeerTrustState>();
  for (const peer of peers) {
    const trusterIds = rows.filter((r) => r.peerId === peer.id).map((r) => r.userId);
    const verifiedTrusterIds = trusterIds.filter((id) => verified.has(id));
    const { trusted, required, worked } = peerTrustWithWork({ verifiedTrusters: verifiedTrusterIds.length, allTrusters: trusterIds.length, verifiedMembersHere: verified.size });
    out.set(peer.id, { trusted, required, trusterIds, verifiedTrusterIds, worked });
  }
  return out;
}

async function trustOf(peerId: string): Promise<PeerTrustState> {
  const state = (await peerTrustAll()).get(peerId);
  if (!state) throw new Error("No such node.");
  return state;
}

// ---------------------------------------------------------------------------
// Taking a bundle in
// ---------------------------------------------------------------------------

export type IngestVia = "push" | "pull" | "file";
export type IngestCounts = {
  members: number;
  listings: number;
  bulletins: number;
  commons: number;
  seeds: number;
  added: number;
  changed: number;
  withdrawn: number;
  vouches: { valid: number; invalid: number; unknownKey: number };
};
export type IngestResult = { outcome: "accepted" | "stale" | "refused"; message: string; status: number; peerId?: string; counts?: IngestCounts };

class AlreadyHad extends Error {}

async function logIngest(peerId: string, via: IngestVia, byId: string | null, outcome: string, note: string, extra: Partial<Prisma.PeerIngestUncheckedCreateInput> = {}) {
  await db.peerIngest.create({ data: { peerId, via, byId, outcome, note, ...extra } });
}

// Take in a bundle that arrived as text, from any route: a peer pushing it, a
// fetch from its address, or a member bringing it as a file. The signature
// decides, not who delivered it. `expectKey`, on a fetch, is the key the
// address is supposed to answer with.
export async function ingestBundle(text: string, via: IngestVia, byId: string | null, expectKey?: string): Promise<IngestResult> {
  if (Buffer.byteLength(text, "utf8") > BUNDLE_MAX_BYTES) return { outcome: "refused", status: 413, message: "That bundle is too large to take in." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { outcome: "refused", status: 400, message: "That is not a node bundle: it is not valid JSON." };
  }
  const key = typeof raw === "object" && raw !== null ? (raw as { node?: { publicKey?: unknown } }).node?.publicKey : undefined;
  if (typeof key !== "string" || !isNodeKey(key)) return { outcome: "refused", status: 400, message: "That is not a node bundle: it does not say which node signed it." };

  const peer = await db.peer.findUnique({ where: { publicKey: key.toLowerCase() } });
  if (!peer) return { outcome: "refused", status: 403, message: "No member here has added a node with that key, so nothing was taken in." };
  if (expectKey && expectKey !== peer.publicKey) {
    const note = "The address answered with a different node's key than the one members here checked.";
    await logIngest(peer.id, via, byId, "refused", note);
    return { outcome: "refused", status: 409, peerId: peer.id, message: `${note} Nothing was taken in.` };
  }
  const trust = await trustOf(peer.id);
  if (!trust.trusted) {
    const note = `Members here have not trusted ${peer.name} yet (${trust.verifiedTrusterIds.length} of ${trust.required}).`;
    await logIngest(peer.id, via, byId, "refused", note);
    return { outcome: "refused", status: 403, peerId: peer.id, message: `${note} Nothing was taken in.` };
  }

  const now = new Date();
  const held = {
    lastBundleAt: peer.lastBundleAt,
    checkpoint: peer.checkpointRoot && peer.checkpointCount !== null ? { root: peer.checkpointRoot, count: peer.checkpointCount } : null,
  };
  const verdict = checkBundle(raw, peer.publicKey, held, now);
  if (verdict.outcome === "refused") {
    const note = `Refused a bundle from ${peer.name}: ${verdict.reason}.`;
    await logIngest(peer.id, via, byId, "refused", note);
    return { outcome: "refused", status: /signature/.test(verdict.reason) ? 403 : 422, peerId: peer.id, message: note };
  }
  if (verdict.outcome === "stale") {
    const note = `Already had this bundle from ${peer.name}, or a newer one.`;
    await logIngest(peer.id, via, byId, "stale", note, { bundleAt: new Date(verdict.at) });
    return { outcome: "stale", status: 200, peerId: peer.id, message: note };
  }

  const { bundle, ledger, vouches } = verdict;
  const bundleAt = new Date(bundle.at);
  let counts: IngestCounts;
  try {
    counts = await db.$transaction(
      async (tx) => {
        // Claim first: only one bundle at a time can move this peer forward,
        // and only to a later bundle than the one it holds.
        const claimed = await tx.peer.updateMany({
          where: { id: peer.id, OR: [{ lastBundleAt: null }, { lastBundleAt: { isSet: false } }, { lastBundleAt: { lt: bundleAt } }] },
          data: {
            lastBundleAt: bundleAt,
            lastIngestAt: now,
            checkpointRoot: ledger.root,
            checkpointCount: ledger.count,
            checkpointAt: new Date(bundle.ledger.checkpoint.at),
            books: bundle.books,
            ...(ledger.historyChanged ? { historyChangedAt: now } : {}),
          },
        });
        if (claimed.count === 0) throw new AlreadyHad();

        const memberCount = await applyMembers(tx, peer.id, bundle, vouches.perMember, now);
        const records = await applyRecords(tx, peer.id, bundle, now);
        const result: IngestCounts = { members: memberCount, ...records, vouches: { valid: vouches.valid, invalid: vouches.invalid, unknownKey: vouches.unknownKey } };
        await tx.peerIngest.create({
          data: { peerId: peer.id, via, byId, bundleAt, outcome: "accepted", note: acceptedNote(peer.name, result, ledger.historyChanged), counts: result, root: ledger.root, entries: ledger.count },
        });
        return result;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (!(error instanceof AlreadyHad)) throw error;
    const note = `Already had this bundle from ${peer.name}, or a newer one.`;
    await logIngest(peer.id, via, byId, "stale", note, { bundleAt });
    return { outcome: "stale", status: 200, peerId: peer.id, message: note };
  }
  return { outcome: "accepted", status: 200, peerId: peer.id, counts, message: acceptedNote(peer.name, counts, ledger.historyChanged) };
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function acceptedNote(name: string, c: IngestCounts, historyChanged: boolean): string {
  const parts = [
    plural(c.listings, "need or offer", "needs and offers"),
    plural(c.bulletins, "notice", "notices"),
    plural(c.commons, "shared thing", "shared things"),
    plural(c.seeds, "seed variety", "seed varieties"),
  ];
  let note = `Took in ${name}'s bundle: ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}.`;
  if (c.vouches.invalid) note += ` ${plural(c.vouches.invalid, "vouch signature", "vouch signatures")} did not check out and ${c.vouches.invalid === 1 ? "was" : "were"} not counted.`;
  if (historyChanged) note += " Its ledger history has changed since the last bundle: the part this node held is not the start of what it sent now.";
  return note;
}

type Tx = Prisma.TransactionClient;

async function applyMembers(tx: Tx, peerId: string, bundle: NodeBundle, signedVouches: Map<string, number>, now: Date): Promise<number> {
  const incoming = new Map(bundle.members.map((m) => [m.id, m])); // one row per id, even if a bundle repeats one
  const existing = await tx.peerMember.findMany({ where: { peerId } });
  const byRemote = new Map(existing.map((m) => [m.remoteId, m]));
  const create: Prisma.PeerMemberCreateManyInput[] = [];
  for (const m of incoming.values()) {
    const signed = signedVouches.get(m.id) ?? 0;
    const old = byRemote.get(m.id);
    if (!old) {
      create.push({ peerId, remoteId: m.id, username: m.username, locality: m.locality, publicKey: m.publicKey, signedVouches: signed, seenAt: now });
    } else if (old.username !== m.username || old.locality !== m.locality || (old.publicKey ?? null) !== m.publicKey || old.signedVouches !== signed || old.goneAt) {
      await tx.peerMember.update({ where: { id: old.id }, data: { username: m.username, locality: m.locality, publicKey: m.publicKey, signedVouches: signed, seenAt: now, goneAt: null } });
    }
  }
  if (create.length) await tx.peerMember.createMany({ data: create });
  const gone = existing.filter((m) => !m.goneAt && !incoming.has(m.remoteId)).map((m) => m.id);
  if (gone.length) await tx.peerMember.updateMany({ where: { id: { in: gone } }, data: { goneAt: now } });
  return incoming.size;
}

async function applyRecords(tx: Tx, peerId: string, bundle: NodeBundle, now: Date) {
  const sets: [PeerRecordKind, BundleRecord[]][] = [
    ["LISTING", bundle.listings],
    ["BULLETIN", bundle.bulletins],
    ["COMMONS", bundle.commons],
    ["SEED", bundle.seeds],
  ];
  const existing = await tx.peerRecord.findMany({ where: { peerId }, select: { id: true, kind: true, remoteId: true, digest: true, goneAt: true } });
  const byKey = new Map(existing.map((r) => [`${r.kind}:${r.remoteId}`, r]));
  const seen = new Set<string>();
  const create: Prisma.PeerRecordCreateManyInput[] = [];
  let changed = 0;
  for (const [kind, records] of sets) {
    for (const record of records) {
      const key = `${kind}:${record.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const digest = recordDigest(record);
      const columns = {
        authorRemoteId: record.authorId,
        category: "category" in record ? record.category : null,
        locality: record.locality,
        lat: record.pin?.lat ?? null,
        lng: record.pin?.lng ?? null,
        data: record as unknown as Prisma.InputJsonValue,
        digest,
      };
      const old = byKey.get(key);
      if (!old) {
        create.push({ peerId, kind, remoteId: record.id, ...columns, firstSeenAt: now, changedAt: now });
      } else if (old.digest !== digest || old.goneAt) {
        changed++;
        await tx.peerRecord.update({ where: { id: old.id }, data: { ...columns, ...(old.digest !== digest ? { changedAt: now } : {}), goneAt: null } });
      }
    }
  }
  if (create.length) await tx.peerRecord.createMany({ data: create });
  const gone = existing.filter((r) => !r.goneAt && !seen.has(`${r.kind}:${r.remoteId}`)).map((r) => r.id);
  if (gone.length) await tx.peerRecord.updateMany({ where: { id: { in: gone } }, data: { goneAt: now } });
  return {
    listings: bundle.listings.length,
    bulletins: bundle.bulletins.length,
    commons: bundle.commons.length,
    seeds: bundle.seeds.length,
    added: create.length,
    changed,
    withdrawn: gone.length,
  };
}

// ---------------------------------------------------------------------------
// Talking to another node
// ---------------------------------------------------------------------------

// The address rule from federation.shared.ts, plus a look at what the name
// resolves to right now, so a public-looking name that points inside the
// network is refused too.
export async function addressProblem(url: string): Promise<string | null> {
  const problem = peerUrlProblem(url, { allowLocal: allowLocal() });
  if (problem || allowLocal()) return problem;
  try {
    const addresses = await lookup(new URL(url).hostname, { all: true });
    const inside = addresses.length === 0 || addresses.some((a) => (a.family === 4 ? !isPublicIPv4(a.address) : !isPublicIPv6(a.address)));
    return inside ? "That address leads inside a private network, which this server will not fetch from." : null;
  } catch {
    return "That address could not be found. Check it with someone on that node.";
  }
}

// Headers that prove this node is the one asking: its key, the time, and a
// signature over both plus the path and the key of the node being asked.
export function signedRequestHeaders(method: string, pathWithQuery: string, audienceKey: string): Record<string, string> {
  const at = new Date().toISOString();
  return {
    [NODE_HEADER]: nodePublicKey(),
    [TIME_HEADER]: at,
    [SIGNATURE_HEADER]: signWithNodeKey(requestMessage(method, pathWithQuery, at, audienceKey)),
  };
}

// Read a response or request body up to `max` bytes; null when it is larger.
export async function readCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<string | null> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function reachablePeer(peerId: string): Promise<{ peer: Peer; url: string } | { error: string; status: number; peer?: Peer }> {
  const peer = await db.peer.findUnique({ where: { id: peerId } });
  if (!peer) return { error: "There is no such node here.", status: 404 };
  const trust = await trustOf(peer.id);
  if (!trust.trusted) return { peer, status: 403, error: `Members here have not trusted ${peer.name} yet (${trust.verifiedTrusterIds.length} of ${trust.required}), so nothing is fetched from it or sent to it.` };
  if (!peer.url) return { peer, status: 400, error: `No address is set for ${peer.name}. Bring its bundle by file instead.` };
  const problem = await addressProblem(peer.url);
  if (problem) return { peer, status: 400, error: problem };
  return { peer, url: peer.url };
}

async function errorFrom(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown };
    const said = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : "";
    return said ? `"${said.slice(0, 300)}"` : `status ${response.status}`;
  } catch {
    return `status ${response.status}`;
  }
}

// Fetch a trusted node's bundle from its address and take it in. Asks only
// for the ledger history after the part this node already holds.
export async function fetchFromPeer(peerId: string, byId: string): Promise<IngestResult> {
  const target = await reachablePeer(peerId);
  if ("error" in target) return { outcome: "refused", status: target.status, peerId: target.peer?.id, message: target.error };
  const { peer, url } = target;
  const address = new URL(`${url}/api/federation/bundle?from=${peer.checkpointCount ?? 0}`);
  let response: Response;
  try {
    response = await fetch(address, {
      headers: { accept: "application/json", ...signedRequestHeaders("GET", address.pathname + address.search, peer.publicKey) },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    const note = `Could not reach ${peer.name} at ${url}. It may be down, or the address may have changed.`;
    await logIngest(peer.id, "pull", byId, "refused", note);
    return { outcome: "refused", status: 502, peerId: peer.id, message: note };
  }
  if (!response.ok) {
    const note = `${peer.name} did not send its bundle. It answered ${await errorFrom(response)}.`;
    await logIngest(peer.id, "pull", byId, "refused", note);
    return { outcome: "refused", status: 502, peerId: peer.id, message: note };
  }
  const text = await readCapped(response.body, BUNDLE_MAX_BYTES);
  if (text === null) {
    const note = `${peer.name} sent a bundle too large to take in.`;
    await logIngest(peer.id, "pull", byId, "refused", note);
    return { outcome: "refused", status: 413, peerId: peer.id, message: note };
  }
  return ingestBundle(text, "pull", byId, peer.publicKey);
}

// Send this node's bundle to a trusted node, which takes it in if its own
// members trust this node. Returns what that node said.
export async function sendToPeer(peerId: string): Promise<{ ok: boolean; message: string }> {
  const target = await reachablePeer(peerId);
  if ("error" in target) return { ok: false, message: target.error };
  const { peer, url } = target;
  const bundle = await buildNodeBundle();
  let response: Response;
  try {
    response = await fetch(`${url}/api/federation/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(bundle),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { ok: false, message: `Could not reach ${peer.name} at ${url}. It may be down, or the address may have changed.` };
  }
  let said = "";
  let outcome = "";
  try {
    const body = (await response.json()) as { message?: unknown; outcome?: unknown };
    said = typeof body.message === "string" ? body.message.slice(0, 300) : "";
    outcome = typeof body.outcome === "string" ? body.outcome : "";
  } catch {
    // Not JSON: report the status alone.
  }
  const ok = response.ok && outcome !== "refused";
  return { ok, message: said ? `${peer.name} answered: "${said}"` : `${peer.name} answered with status ${response.status}.` };
}

// Is this request from a node members here trust? Checks the signed headers
// a node sends when it asks for a bundle (see signedRequestHeaders).
export async function peerFromRequest(headers: Headers, method: string, pathWithQuery: string): Promise<{ ok: true; peer: Peer } | { ok: false; status: number; error: string }> {
  const key = headers.get(NODE_HEADER)?.trim().toLowerCase();
  const at = headers.get(TIME_HEADER)?.trim();
  const sig = headers.get(SIGNATURE_HEADER)?.trim().toLowerCase();
  if (!key || !isNodeKey(key) || !at || !sig) return { ok: false, status: 400, error: "A node asking for a bundle must name its key and sign the request." };
  if (!withinClockSkew(at, new Date())) return { ok: false, status: 401, error: "The request's time is too far from this node's clock. Check both clocks." };
  if (!verifyMessage(requestMessage(method, pathWithQuery, at, nodePublicKey()), sig, key)) return { ok: false, status: 401, error: "The request's signature does not check out." };
  const peer = await db.peer.findUnique({ where: { publicKey: key } });
  if (!peer) return { ok: false, status: 403, error: "No member of this node has added your node." };
  const trust = await trustOf(peer.id);
  if (!trust.trusted) return { ok: false, status: 403, error: "Members of this node have not trusted your node yet." };
  return { ok: true, peer };
}

// ---------------------------------------------------------------------------
// Reading what came in, for the pages
// ---------------------------------------------------------------------------

export type PeerAuthor = { username: string; locality: string; signedVouches: number };
export type Shown<T> = T & { rowId: string; author: PeerAuthor | null; firstSeenAt: Date; changedAt: Date };

// What a peer currently publishes, parsed back through the same schemas it
// was checked with on the way in. Expired notices are left out even before
// the next bundle arrives.
export async function peerContents(peerId: string) {
  const now = Date.now();
  const [rows, members] = await Promise.all([
    db.peerRecord.findMany({ where: { peerId, ...current }, orderBy: { changedAt: "desc" } }),
    db.peerMember.findMany({ where: { peerId }, select: { remoteId: true, username: true, locality: true, signedVouches: true } }),
  ]);
  const authorOf = new Map(members.map((m) => [m.remoteId, { username: m.username, locality: m.locality, signedVouches: m.signedVouches }]));
  function parse<T>(kind: PeerRecordKindName): Shown<T>[] {
    return rows
      .filter((row) => row.kind === kind)
      .flatMap((row) => {
        const parsed = RECORD_SCHEMAS[kind].safeParse(row.data);
        if (!parsed.success) return [];
        return [{ ...(parsed.data as T), rowId: row.id, author: authorOf.get(row.authorRemoteId) ?? null, firstSeenAt: row.firstSeenAt, changedAt: row.changedAt }];
      });
  }
  return {
    listings: parse<BundleListing>("LISTING"),
    bulletins: parse<BundleBulletin>("BULLETIN").filter((b) => !b.expiresAt || Date.parse(b.expiresAt) > now),
    commons: parse<BundleCommons>("COMMONS"),
    seeds: parse<BundleSeed>("SEED"),
  };
}

// How much each peer currently publishes, by kind, for the list of nodes.
export async function peerRecordCounts(): Promise<Map<string, Record<PeerRecordKind, number>>> {
  const groups = await db.peerRecord.groupBy({ by: ["peerId", "kind"], where: current, _count: { _all: true } });
  const out = new Map<string, Record<PeerRecordKind, number>>();
  for (const g of groups) {
    const counts = out.get(g.peerId) ?? { LISTING: 0, BULLETIN: 0, COMMONS: 0, SEED: 0 };
    counts[g.kind] = g._count._all;
    out.set(g.peerId, counts);
  }
  return out;
}
