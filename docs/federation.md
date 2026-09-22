# Other nodes (federation)

A node is one community's own copy of Freewill. Nodes can take in each other's
public records, the way you would accept statements from a bank you had
checked. This file is for whoever runs a node, or builds something that talks
to one. The rules live in `src/lib/federation.shared.ts` (pure) and
`src/lib/federation.ts` (server). `npm run smoke:federation` holds them.

## Who decides

No one person. A member adds another node on `/nodes` with a name, its key and
(optionally) its address. That counts as their trust. The node is **trusted**
once enough verified members trust it: `round(sqrt(verified members here) / 3)`,
at least 1 and at most 7, the same rule as vouches for a person
(`peerTrustWithWork`). Trust from members who are not verified does not count.
Anyone can withdraw their own trust at any time.

Until a node is trusted, nothing it sends is stored and nothing of ours is sent
to it. Peers are never deleted. A peer nobody trusts just stops counting.

## The node key

A node's key is its **commons key**, the Ed25519 key that already signs its
ledger checkpoints (`COMMONS_KEY_SEED`, falling back to `SESSION_SECRET`). The
key is shown on `/nodes` and served by `GET /api/federation/node`. Rotating
`COMMONS_KEY_SEED` gives the node a new identity: every peer has to add it again.

Members should check the whole key with someone who lives there, by voice or on
paper. The address alone proves nothing. When a member gives an address, the
server asks it for its key and refuses to add the node if the key is different.

## Endpoints

| Method and path | Who may call it | What it does |
|---|---|---|
| `GET /api/federation/node` | anyone | `{ format, version, publicKey, fingerprint, bundle, ingest }`. No personal data. |
| `GET /api/federation/bundle[?from=N]` | a signed-in member (downloads a file), or a trusted node with signed headers | This node's signed bundle. `from=N` sends ledger hashes from entry N on. |
| `POST /api/federation/ingest` | anyone (JSON), or a signed-in member (file upload) | Takes in a bundle if its signer is a trusted peer. JSON answer: `{ outcome, message, counts }`. |

The ingest endpoint is limited to 30 requests per address per 15 minutes
(`RATE_LIMITS.ingestPerAddress`) and 8 MB per bundle (`BUNDLE_MAX_BYTES`).

### Asking for a bundle as a node

Send three headers:

```
x-freewill-node:      <your node key, hex>
x-freewill-time:      <ISO time, within 5 minutes of theirs>
x-freewill-signature: <Ed25519 signature, hex>
```

The signature covers the UTF-8 bytes of the string below, with fields joined by
a NUL character (`\u0000`):

```
FWREQ1 NUL <METHOD> NUL <path and query, e.g. /api/federation/bundle?from=12> NUL <time> NUL <their node key, lowercase hex>
```

Naming the node being asked stops the request being replayed to a third node.
The time stops it being replayed later. The answer is `403` unless that node's
members trust your key.

## The bundle

```jsonc
{
  "format": "freewill-node-bundle",
  "version": 1,
  "node": { "publicKey": "<hex>" },
  "at": "<ISO time it was signed>",
  "books": { "people": 12, "balances": true, "graceTotal": 0, "hoursTotal": 0 },
  "members":  [{ "id", "username", "locality", "publicKey" | null }],
  "vouches":  [{ "fromId", "toId", "signature" }],
  "listings": [{ "id", "authorId", "kind", "category", "title", "description", "quantity", "wantsInReturn", "priceGrace", "priceHours", "locality", "pin", "status", "createdAt" }],
  "bulletins": [{ "id", "authorId", "title", "body", "level", "locality", "pin", "createdAt", "expiresAt" }],
  "commons":  [{ "id", "authorId", "name", "description", "category", "rules", "locality", "pin", "available", "createdAt" }],
  "seeds":    [{ "id", "authorId", "name", "form", "category", "description", "openPollinated", "quantity", "daysToMaturity", "sowMonths", "locality", "pin", "createdAt" }],
  "ledger": {
    "checkpoint": { "root", "count", "at", "sig", "pubKey" },
    "from": 0,
    "prev": "<chain hash before entry `from`; 64 zeros when from is 0>",
    "payloadHashes": ["<hex>", "..."]
  },
  "sig": "<hex>"
}
```

- **What travels:** open and matched listings, current notices, shared things,
  available seeds, the people who wrote them (username, locality, public key),
  and the signed vouches for those people.
- **What never travels:** balances, transfers, who paid whom, disputes, votes,
  passwords, ID.me codes, themes, and anyone's own pin. Pins on published
  records are rounded to two decimals (about a kilometer).
- **Prices** (`priceGrace` in hundredths, `priceHours` in minutes) are in the
  sending node's own ledgers. Grace does not cross nodes.
- **`books`** is the sender's own word. Nobody else can check it.

### What is signed

`sig` is an Ed25519 signature by `node.publicKey` over:

```
FWNODE1 NUL <sha256 hex of canonicalJson(the bundle without "sig")>
```

`canonicalJson` sorts object keys and adds no spaces (`src/lib/federation.shared.ts`).
The receiver checks the signature over the JSON exactly as it arrived, before
it validates anything. So fields added by a later version are still covered by
the signature, and are then ignored.

`ledger.checkpoint` is signed exactly as in `/verify` (`FWCK1`, see
`checkpoint.shared.ts`), and must be signed by the same key as the bundle.

## Checks on the way in (`checkBundle`)

A bundle is refused, with a reason written to the node's page, when:

1. it does not parse as the format above;
2. its signature does not check out against the key it names;
3. it is dated more than 5 minutes in the future;
4. its ledger checkpoint is signed by another key, or the hashes folded onto
   `prev` do not give the signed root and count;
5. its ledger history starts after the part this node holds.

A bundle no newer than the last one taken in is recorded as "already had it" and
changes nothing. A bundle from a key no member here has added is refused and
**not** recorded, so strangers cannot fill the log.

If a new bundle's history does not begin with the history held from the last
one, it is still taken in, but the node's page says its ledger history changed,
and when. That happens when records there were rewritten, and also after a
one-time repair such as `migrate:grace-cents`. Members should ask which.

A vouch counts only if its signature checks out against the voucher's key in the
same bundle, once per pair, and never for oneself.

## Storing (`ingestBundle`)

One transaction per bundle. It first claims the peer (moving `lastBundleAt`
forward only if the bundle is newer), then applies the records:

- new records are created;
- changed records (by `recordDigest`) are updated;
- records missing from the new bundle are marked `goneAt`, never deleted.

Every accepted, stale or refused bundle from a known peer is appended to
`PeerIngest`.

## Moving bundles

- **Fetch**: on a trusted node's page, "Fetch its bundle now" asks its address,
  with signed headers, for everything after the ledger entries already held.
- **Send**: "Send ours now" posts this node's whole bundle to its
  `/api/federation/ingest`. It is taken in only if that node's members trust ours.
- **By hand**: download this node's bundle from `/nodes`, carry the file, and
  bring it in on the other node's `/nodes` page.

Nothing runs on a schedule.

## Fetch safety

A public server (`NODE_ENV=production`) fetches only `https://` addresses. It
refuses names for its own machine or local network, IP addresses in private,
loopback, link-local or carrier-grade NAT ranges, credentials, and query
strings (`peerUrlProblem`). Just before it fetches, it also refuses a name that
resolves to such an address (`addressProblem`). Redirects are not followed.
Known gap: the resolved address is not pinned for the fetch itself, so a name
that changes what it points to between the check and the fetch can get past.

## Trying it on one machine

In development (`next dev`), `http://localhost` addresses are allowed. Run a
second copy with its own database and its own `SESSION_SECRET` (or
`COMMONS_KEY_SEED`) on another port. On each copy, add the other's key from its
`/nodes` page, with `http://localhost:<port>` as the address. Then press fetch
or send.
