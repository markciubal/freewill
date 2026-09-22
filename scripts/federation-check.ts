// Other nodes: signed bundles, the checks they must pass, the trust rule, the
// address rule, and a live round trip against the dev DB that removes the
// rows it made. Run: npm run smoke:federation
import "./not-production";
import { createRequire } from "node:module";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";

// federation.ts is marked server-only so no page can ship it to a browser. A
// script is not a browser: stand the marker in for its server build, then
// load the modules that use it.
const localRequire = createRequire(__filename);
const marker = localRequire.resolve("server-only");
localRequire.cache[marker] = { id: marker, filename: marker, loaded: true, exports: {} } as NodeJS.Module;

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const utf8 = (s: string) => new TextEncoder().encode(s);
function keypair(label: string) {
  const seed = sha256(utf8(`smoke-federation:${label}:${Date.now()}`));
  return { seed, pub: hex(ed25519.getPublicKey(seed)) };
}
const signWith = (seed: Uint8Array, message: string) => hex(ed25519.sign(utf8(message), seed));
const id = (n: number) => n.toString(16).padStart(24, "a");

async function main() {
  const fed = await import("../src/lib/federation");
  const { checkpointString } = await import("../src/lib/checkpoint.shared");
  const { entryHash } = await import("../src/lib/hashlog");
  const { vouchToken } = await import("../src/lib/keys");
  const { requiredVouchesFor } = await import("../src/lib/standing");

  // --- Signed bytes --------------------------------------------------------
  assert(fed.canonicalJson({ b: 1, a: [2, { d: null, c: "x" }] }) === fed.canonicalJson({ a: [2, { c: "x", d: null }], b: 1 }), "the signed form of a bundle does not depend on the order its fields were written in");
  assert(fed.canonicalJson({ a: 1, b: undefined }) === '{"a":1}', "a field left undefined is left out, as it would be in JSON");

  // --- A fake node, B, with two members who hold keys ------------------------
  const nodeB = keypair("node-b");
  const nodeC = keypair("node-c");
  const ada = keypair("ada");
  const bo = keypair("bo");
  const payloads = Array.from({ length: 5 }, (_, i) => hex(sha256(utf8(`entry ${i}`))));
  const chainTo = (hashes: string[], prev = fed.GENESIS) => hashes.reduce((h, p) => entryHash(h, p), prev);

  function ledgerPart(key: typeof nodeB, hashes: string[], from = 0, prev = fed.GENESIS) {
    const at = new Date().toISOString();
    const root = chainTo(hashes.slice(from), prev);
    return { checkpoint: { root, count: hashes.length, at, sig: signWith(key.seed, checkpointString(root, hashes.length, at)), pubKey: key.pub }, from, prev, payloadHashes: hashes.slice(from) };
  }

  // Records keep the time they were posted, whatever bundle carries them.
  const posted = "2026-09-01T12:00:00.000Z";
  function unsignedBundle(at: Date, over: Record<string, unknown> = {}) {
    return {
      format: fed.BUNDLE_FORMAT,
      version: fed.BUNDLE_VERSION,
      node: { publicKey: nodeB.pub },
      at: at.toISOString(),
      books: { people: 2, balances: true, graceTotal: 0, hoursTotal: 0 },
      members: [
        { id: id(1), username: "test-ada", locality: "Test Valley", publicKey: ada.pub },
        { id: id(2), username: "test-bo", locality: "Test Valley", publicKey: bo.pub },
      ],
      vouches: [
        { fromId: id(1), toId: id(2), signature: signWith(ada.seed, vouchToken(id(1), id(2))) },
        { fromId: id(2), toId: id(1), signature: signWith(bo.seed, vouchToken(id(2), id(1))) },
        { fromId: id(2), toId: id(1), signature: signWith(ada.seed, vouchToken(id(2), id(1))) }, // forged: ada's key signing in bo's name
        { fromId: id(1), toId: id(2), signature: signWith(ada.seed, vouchToken(id(1), id(2))) }, // the same vouch twice counts once
        { fromId: id(1), toId: id(1), signature: signWith(ada.seed, vouchToken(id(1), id(1))) }, // nobody vouches for themselves
      ],
      listings: [
        { id: id(10), authorId: id(1), kind: "OFFER", category: "WATER", title: "Clean water, 20 L a day", description: "From the rain tank.", quantity: "20 L", wantsInReturn: null, priceGrace: null, priceHours: null, locality: "Test Valley", pin: { lat: 45.51, lng: -122.68 }, status: "OPEN", createdAt: posted },
        { id: id(11), authorId: id(2), kind: "NEED", category: "MEDICAL", title: "Insulin", description: "", quantity: null, wantsInReturn: "Firewood", priceGrace: 500, priceHours: null, locality: "Test Valley", pin: null, status: "OPEN", createdAt: posted },
      ],
      bulletins: [{ id: id(20), authorId: id(1), title: "Bridge out on the river road", body: "Use the ford.", level: "HAZARD", locality: null, pin: null, createdAt: posted, expiresAt: null }],
      commons: [{ id: id(30), authorId: id(2), name: "Tool shed", description: "Saws and a ladder.", category: "TOOLS", rules: "Bring it back by dark.", locality: "Test Valley", pin: { lat: 45.5, lng: -122.7 }, available: true, createdAt: posted }],
      seeds: [{ id: id(40), authorId: id(1), name: "Scarlet runner bean", form: "SEED", category: "VEGETABLE", description: "Saved last year.", openPollinated: true, quantity: "about 40 seeds", daysToMaturity: 70, sowMonths: [4, 5], locality: "Test Valley", pin: null, createdAt: posted }],
      ledger: ledgerPart(nodeB, payloads.slice(0, 3)),
      ...over,
    };
  }
  const sign = (unsigned: Record<string, unknown>, key = nodeB) => ({ ...unsigned, sig: signWith(key.seed, fed.bundleMessage(unsigned)) });
  const asReceived = (bundle: unknown) => JSON.parse(JSON.stringify(bundle));
  const fresh = { lastBundleAt: null, checkpoint: null };
  const now = new Date();
  const t0 = new Date(now.getTime() - 10 * 60_000);

  const good = asReceived(sign(unsignedBundle(t0)));
  const verdict = fed.checkBundle(good, nodeB.pub, fresh, now);
  assert(verdict.outcome === "accepted", `a bundle signed by the node's key is taken in (${verdict.outcome}${verdict.outcome === "refused" ? `: ${verdict.reason}` : ""})`);
  if (verdict.outcome === "accepted") {
    assert(verdict.vouches.valid === 2 && verdict.vouches.invalid === 1 && verdict.vouches.perMember.get(id(1)) === 1, `only vouches whose signatures check out count, once per pair and never for oneself (${verdict.vouches.valid} valid, ${verdict.vouches.invalid} forged)`);
  }

  // --- Refusals, each with its reason ---------------------------------------
  const refused = (raw: unknown, key = nodeB.pub, held: Parameters<typeof fed.checkBundle>[2] = fresh) => {
    const v = fed.checkBundle(raw, key, held, now);
    return v.outcome === "refused" ? v.reason : "";
  };
  const edited = asReceived(good);
  edited.listings[0].title = "Clean water, 200 L a day";
  assert(/signature/.test(refused(edited)), "a bundle edited after it was signed is refused: its signature no longer checks out");
  assert(/signature/.test(refused(asReceived(sign(unsignedBundle(t0), nodeC)))), "a bundle that names node B but was signed by node C is refused");
  assert(/different node/.test(refused(good, nodeC.pub)), "a bundle is only taken in as the node whose key signed it");
  assert(/future/.test(refused(asReceived(sign(unsignedBundle(new Date(now.getTime() + 60 * 60_000)))))), "a bundle dated an hour ahead is refused");
  assert(/not a bundle/.test(refused({ format: "something else" })), "a file that is not a bundle is refused as unreadable");
  const stale = fed.checkBundle(good, nodeB.pub, { lastBundleAt: t0, checkpoint: null }, now);
  assert(stale.outcome === "stale", "the same bundle a second time changes nothing");

  // Fields a later version adds are covered by the signature, then ignored.
  const withExtra = asReceived(sign({ ...unsignedBundle(t0), note: "from a newer version" }));
  assert(fed.checkBundle(withExtra, nodeB.pub, fresh, now).outcome === "accepted", "a field this version does not know is still covered by the signature");
  delete withExtra.note;
  assert(/signature/.test(refused(withExtra)), "and removing that field after signing is caught");

  // --- The ledger: history must carry what was held ---------------------------
  const held3 = { root: chainTo(payloads.slice(0, 3)), count: 3 };
  const extend = fed.checkLedgerPart(ledgerPart(nodeB, payloads), nodeB.pub, held3);
  assert(extend.ok && !extend.historyChanged, "a history that grew from the one held is accepted as the same history");
  const rewritten = [payloads[0], hex(sha256(utf8("a quietly changed entry"))), ...payloads.slice(2)];
  const changed = fed.checkLedgerPart(ledgerPart(nodeB, rewritten), nodeB.pub, held3);
  assert(changed.ok && changed.historyChanged, "a history with an earlier entry changed is caught as changed");
  const shorter = fed.checkLedgerPart(ledgerPart(nodeB, payloads.slice(0, 2)), nodeB.pub, held3);
  assert(shorter.ok && shorter.historyChanged, "a history shorter than the one held is caught as changed");
  const onlyNew = fed.checkLedgerPart(ledgerPart(nodeB, payloads, 3, held3.root), nodeB.pub, held3);
  assert(onlyNew.ok && !onlyNew.historyChanged, "a fetch can carry only the entries after the part already held");
  const skipped = fed.checkLedgerPart(ledgerPart(nodeB, payloads, 3, held3.root), nodeB.pub, { root: chainTo(payloads.slice(0, 2)), count: 2 });
  assert(!skipped.ok, "a history that starts after the part held cannot be lined up, and is refused");
  const otherKey = fed.checkLedgerPart(ledgerPart(nodeC, payloads), nodeB.pub, null);
  assert(!otherKey.ok && /different key/.test(otherKey.reason), "a ledger checkpoint signed by another key is refused");
  const broken = ledgerPart(nodeB, payloads);
  broken.payloadHashes[1] = hex(sha256(utf8("swapped")));
  assert(!fed.checkLedgerPart(broken, nodeB.pub, null).ok, "a chain that does not lead to its signed root is refused");

  // --- Asking for a bundle -----------------------------------------------------
  const at = now.toISOString();
  const askSig = signWith(nodeC.seed, fed.requestMessage("GET", "/api/federation/bundle?from=3", at, nodeB.pub));
  const { verifyMessage } = await import("../src/lib/keys");
  assert(verifyMessage(fed.requestMessage("GET", "/api/federation/bundle?from=3", at, nodeB.pub), askSig, nodeC.pub), "a node's signed request checks out at the node it asked");
  assert(!verifyMessage(fed.requestMessage("GET", "/api/federation/bundle?from=3", at, keypair("other").pub), askSig, nodeC.pub), "the same request replayed to a third node does not");
  assert(!verifyMessage(fed.requestMessage("GET", "/api/federation/bundle?from=0", at, nodeB.pub), askSig, nodeC.pub), "nor with its path changed");
  assert(fed.withinClockSkew(at, now) && !fed.withinClockSkew(new Date(now.getTime() - 60 * 60_000).toISOString(), now), "a request an hour old is too old");

  // --- Trust -------------------------------------------------------------------
  for (const [verifiedHere, counted] of [[4, 1], [100, 2], [100, 3], [1000, 7], [0, 0]] as const) {
    const t = fed.peerTrustWithWork({ verifiedTrusters: counted, allTrusters: counted + 2, verifiedMembersHere: verifiedHere });
    const steps = t.worked.steps;
    assert(t.required === requiredVouchesFor(verifiedHere) && steps[0].result === t.required && steps[2].result === t.trusted && t.trusted === counted >= t.required, `${verifiedHere} verified here: ${counted} verified trust needs ${t.required}, so ${t.trusted ? "taken in" : "not yet"}, and the steps say the same`);
  }
  assert(!fed.peerTrustWithWork({ verifiedTrusters: 0, allTrusters: 9, verifiedMembersHere: 4 }).trusted, "trust from members who are not verified does not count, however many");
  const reads = (s: string) => /^[A-Z]/.test(s) && /\.$/.test(s);
  const sentences = [[0, 1], [1, 1], [1, 3], [2, 3], [3, 3], [4, 3]].map(([c, r]) => fed.trustSentence(c, r));
  assert(sentences.every(reads) && sentences[1].startsWith("Trusted by 1 verified member,") && sentences[3].startsWith("Trusted by 2 verified members;") && sentences[2].includes("3 are needed") && sentences[0].includes("1 is needed"), `the trust count reads right at every size: "${sentences[0]}" / "${sentences[2]}" / "${sentences[4]}"`);

  // --- Where a node may be fetched from ------------------------------------------
  const prod = { allowLocal: false };
  assert(fed.peerUrlProblem("https://north-ridge.example.org", prod) === null, "a public https address is allowed");
  const inside = ["http://north-ridge.example.org", "https://localhost:3000", "https://127.0.0.1", "https://10.0.0.5", "https://169.254.169.254", "https://192.168.1.10", "https://[::1]", "https://printer.local", "https://intranet", "https://user:pw@north-ridge.example.org", "https://north-ridge.example.org/?x=1"];
  const let_through = inside.filter((u) => fed.peerUrlProblem(u, prod) === null);
  assert(let_through.length === 0, `a public server refuses plain http, its own machine, private networks, credentials and query strings${let_through.length ? `; let through: ${let_through.join(", ")}` : ` (${inside.length} tried)`}`);
  assert(fed.peerUrlProblem("http://localhost:3001", { allowLocal: true }) === null, "in development two nodes on one machine may talk over http://localhost");
  assert(fed.normalizePeerUrl("https://North-Ridge.example.org/freewill/") === "https://north-ridge.example.org/freewill", "an address is kept without its trailing slash");
  assert(!fed.isPublicIPv4("100.64.1.1") && fed.isPublicIPv4("93.184.216.34") && !fed.isPublicIPv6("fd00::1") && fed.isPublicIPv6("2606:4700::1111"), "resolved addresses are sorted into private and public correctly");

  // --- Live: this node's own bundle, and a round trip through the database -----
  const { db } = await import("../src/lib/db");
  try {
    const ours: import("../src/lib/federation").NodeBundle = asReceived(await fed.buildNodeBundle());
    const ownCheck = fed.checkBundle(ours, fed.nodePublicKey(), fresh, new Date());
    assert(ownCheck.outcome === "accepted", `this node's own bundle passes the same check another node runs (${ours.listings.length} listings, ${ours.ledger.checkpoint.count} ledger entries)`);
    const memberKeys = new Set(ours.members.flatMap((m) => Object.keys(m)));
    assert([...memberKeys].every((k) => ["id", "username", "locality", "publicKey"].includes(k)), `people travel as a username, a locality and a public key only (${[...memberKeys].join(", ") || "none in this bundle"})`);
    const text = JSON.stringify(ours);
    assert(!/graceBalance|hoursBalance|passwordHash|sessionVersion|idmeHash|"theme"/.test(text), "no balance, password, session, ID.me code or theme leaves the node");
    const pins = [...ours.listings, ...ours.commons, ...ours.seeds, ...ours.bulletins].flatMap((r) => (r.pin ? [r.pin] : []));
    assert(pins.every((p) => Math.round(p.lat * 100) === p.lat * 100 && Math.round(p.lng * 100) === p.lng * 100), `pins leave rounded to about a kilometer (${pins.length} pins)`);
    const partial = await fed.buildNodeBundle({ from: ours.ledger.checkpoint.count });
    assert(partial.ledger.payloadHashes.length === 0 && partial.ledger.prev === ours.ledger.checkpoint.root, "asked for only what is new, it sends only what is new");

    await roundTrip(fed, db, { nodeB, sign, unsignedBundle, asReceived, ledgerPart, payloads, rewritten, now });
  } catch (error) {
    console.log("(dev DB not reachable; skipped the live checks)", (error as Error).message.split("\n")[0]);
    if (!/connect|ECONNREFUSED|Server selection/i.test((error as Error).message)) throw error;
  } finally {
    await db.$disconnect();
  }
}

type Fed = typeof import("../src/lib/federation");
type Db = typeof import("../src/lib/db").db;

// Add node B as a peer, trust it with verified dev members, take its bundles
// in, and remove every row the test made, whatever happens.
async function roundTrip(fed: Fed, db: Db, t: {
  nodeB: ReturnType<typeof keypair>;
  sign: (u: Record<string, unknown>) => unknown;
  unsignedBundle: (at: Date, over?: Record<string, unknown>) => Record<string, unknown>;
  asReceived: (b: unknown) => unknown;
  ledgerPart: (key: ReturnType<typeof keypair>, hashes: string[], from?: number, prev?: string) => unknown;
  payloads: string[];
  rewritten: string[];
  now: Date;
}) {
  const { getStandingAll } = await import("../src/lib/standing.all");
  const { requiredVouchesFor } = await import("../src/lib/standing");
  const standings = await getStandingAll();
  const verified = [...standings].filter(([, s]) => s.verified).map(([userId]) => userId);
  const required = requiredVouchesFor(verified.length);
  if (verified.length < required || verified.length === 0) {
    console.log("(no verified members in the dev DB; skipped the live round trip)");
    return;
  }
  const text = (at: Date, over?: Record<string, unknown>) => JSON.stringify(t.sign(t.unsignedBundle(at, over)));
  const minutesAgo = (m: number) => new Date(t.now.getTime() - m * 60_000);
  const peer = await db.peer.create({ data: { name: "smoke-test node", publicKey: t.nodeB.pub, addedById: verified[0] } });
  try {
    const untrusted = await fed.ingestBundle(text(minutesAgo(9)), "push", null);
    assert(untrusted.outcome === "refused" && untrusted.status === 403, `until members trust it, its bundle is refused: "${untrusted.message}"`);

    await db.peerTrust.createMany({ data: verified.slice(0, required).map((userId) => ({ peerId: peer.id, userId })) });
    const first = await fed.ingestBundle(text(minutesAgo(8)), "push", null);
    assert(first.outcome === "accepted" && first.counts?.added === 5, `once ${required} verified ${required === 1 ? "member trusts" : "members trust"} it, its bundle is taken in: "${first.message}"`);
    const rows = await db.peerRecord.count({ where: { peerId: peer.id } });
    const ada = await db.peerMember.findFirst({ where: { peerId: peer.id, username: "test-ada" } });
    assert(rows === 5 && ada?.signedVouches === 1, `its records are kept here (${rows}), with each person's signed vouches counted (${ada?.signedVouches})`);

    const again = await fed.ingestBundle(text(minutesAgo(8)), "file", verified[0]);
    assert(again.outcome === "stale" && (await db.peerRecord.count({ where: { peerId: peer.id } })) === 5, "taking in the same bundle again changes nothing");

    const unknownKey = await fed.ingestBundle(text(minutesAgo(7)).replace(t.nodeB.pub, "b".repeat(64)), "push", null);
    const logged = await db.peerIngest.count({ where: { peerId: peer.id } });
    assert(unknownKey.outcome === "refused" && /No member here/.test(unknownKey.message), "a bundle from a key nobody here added is refused");

    const tampered = text(minutesAgo(7)).replace("Clean water, 20 L a day", "Clean water, 900 L a day");
    const forged = await fed.ingestBundle(tampered, "push", null);
    assert(forged.outcome === "refused" && /signature/.test(forged.message) && (await db.peerIngest.count({ where: { peerId: peer.id } })) === logged + 1, `a forged bundle is refused with its reason, and the refusal is on record: "${forged.message}"`);

    const later = t.unsignedBundle(minutesAgo(6)) as { listings: { title: string }[] } & Record<string, unknown>;
    later.listings = [{ ...later.listings[0], title: "Clean water, 10 L a day" }];
    later.ledger = t.ledgerPart(t.nodeB, t.payloads);
    const next = await fed.ingestBundle(JSON.stringify(t.sign(later)), "pull", verified[0]);
    const gone = await db.peerRecord.findFirst({ where: { peerId: peer.id, kind: "LISTING", remoteId: id(11) } });
    assert(next.outcome === "accepted" && next.counts?.changed === 1 && next.counts?.withdrawn === 1 && !!gone?.goneAt, "a later bundle updates what changed and marks what it dropped as withdrawn, without deleting it");
    const contents = await fed.peerContents(peer.id);
    assert(contents.listings.length === 1 && contents.listings[0].title === "Clean water, 10 L a day" && contents.bulletins.length === 1, "the page shows only what it publishes now");

    const rewrite = await fed.ingestBundle(text(minutesAgo(5), { ledger: t.ledgerPart(t.nodeB, t.rewritten) }), "push", null);
    const after = await db.peer.findUnique({ where: { id: peer.id } });
    assert(rewrite.outcome === "accepted" && /history has changed/.test(rewrite.message) && !!after?.historyChangedAt, "a rewritten ledger history is taken in but marked on the node's page");

    await db.peerTrust.deleteMany({ where: { peerId: peer.id } });
    const withdrawn = await fed.ingestBundle(text(minutesAgo(4)), "push", null);
    assert(withdrawn.outcome === "refused", "when members withdraw their trust, nothing more is taken in");
  } finally {
    // Test teardown: remove only the rows this test made.
    await db.peerIngest.deleteMany({ where: { peerId: peer.id } });
    await db.peerRecord.deleteMany({ where: { peerId: peer.id } });
    await db.peerMember.deleteMany({ where: { peerId: peer.id } });
    await db.peerTrust.deleteMany({ where: { peerId: peer.id } });
    await db.peer.delete({ where: { id: peer.id } });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
