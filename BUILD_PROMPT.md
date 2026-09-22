# Freewill: the build prompt

This is the prompt I give myself to build and run Freewill. Section 1 is the literal prompt: paste it into Claude (or read it yourself) to continue the work. The rest is the reasoning behind it, so the next builder does not have to re-derive it.

## 1. The prompt

```
You are building Freewill: a mutual-aid commons for a stateless society in which
morality is the only law. Assume the federal government has collapsed or turned
hostile. Your job is to keep neighbors civil, fed, safe, and honest without any
office, police, court, or treasury.

Operate by these rules:

1. Every feature must answer one question: does this keep someone alive, keep
   someone honest, or repair a harm? If not, cut it.
2. No authority anywhere in the system. No admin role, no moderator, no issuer.
   Anything that needs a decision gets one of three things: a computed rule
   (standing), a named steward who is accountable through standing, or a circle.
3. Standing is earned, computed, and public. It gates mutual credit and nothing
   else. It must never be assignable by hand, and it must have diminishing
   returns so nobody can buy or hoard it.
4. Money is mutual credit. There is no mint. The sum of all balances is always
   zero. The credit limit is a function of standing.
5. Harm is answered by a circle: an account, keepers with no stake, restitution,
   a public record. Never exclusion by default. Never a cage.
6. Assume the network will go down and the server will be seized. Prefer designs
   that can be replicated, signed, and merged. Store nothing you do not need to
   run the commons. Never collect email, phone, or location beyond a free-text
   locality.
7. Build in tiers. Ship Tier 0 (Survive) before Tier 1 (Stabilize) before Tier 2
   (Flourish). A polished Tier 0 feature is worth more than a half-built Tier 2.
8. The UI speaks to a frightened, tired person. Short sentences. Plain, civic
   words, never liturgical ones. Names, not IDs. Always say what to do next.
9. Threat-model every change against: fake identities, strongman capture,
   seizure, panic and rumor, scarcity conflict, credit abuse.
10. When you finish a piece of work, update the Program Catalog
    (src/lib/covenant.programs.ts) and this document so the next builder knows
    what is live, what is planned, and why.

Stack: Next.js App Router with server actions, Prisma 6, MongoDB as a replica
set, TypeScript, Tailwind. Auth is username and password only: no email, no
resets. README.md has setup; AGENTS.md has code conventions.

Before writing code: read src/lib/covenant.ts, src/lib/standing.ts,
src/lib/ledger.ts, and prisma/schema.prisma. They are the constitution.

Next task: <fill in>
```

## 2. Why these primitives

**The Covenant.** Seven sentences everyone affirms on joining. It is not enforced by anyone; it is the standard people hold each other to in circles and the reason a vouch means something. Keeping it short matters more than keeping it complete.

**Web of trust and standing.** Without an ID authority the only proof of a person is other people. A vouch is the atom of trust. Standing is computed from vouches received (capped, so a clique cannot inflate it), pledges kept, exchange activity, tenure, and resolved circles that found harm. It gates one thing only: how far into mutual credit a person may go. Making standing gate anything else (voting weight, access) would turn it into a ruling class.

**Grace (GRC): mutual credit.** Barter fails on the double coincidence of wants. Fiat needs a state. Metal needs a vault and invites raids. Mutual credit needs only a ledger and trust: a transfer debits the payer and credits the payee in the same instant, so the money supply is exactly the sum of outstanding promises and always nets to zero. Nobody can inflate it, there is no treasury to seize, and a negative balance is a promise to the whole community, not a debt to a lender. The credit limit is the only lever, and standing holds it.

**Hours: the time bank.** Some things must not be priced. An hour of childcare equals an hour of welding. A second ledger where every hour is equal keeps care work visible and keeps the poorest person's time worth as much as anyone's.

**The board (barter).** Needs and offers, by category and locality, with three ways to settle: pure barter (what would you take in return), a Grace or Hours ask, or a gift. Survival categories (water, food, medical, shelter, safety) always sort first. A pledge is a public promise; kept pledges build standing.

**Commons.** A well, a tool shed, a seed bank, a clinic tent. Private hoarding and state ownership both fail under collapse; a named steward accountable through standing, with rules the users agreed to, is how commons have actually survived for centuries.

**Circles.** When morality is the only law, harm still happens. The alternative to a restorative process is vendetta. A circle has an account, keepers with no stake in the matter, and a written resolution. Resolved circles that found harm lower the standing of the person at fault until kept pledges rebuild it. That is the whole enforcement mechanism, and it is enough for a community small enough to know each other.

**Bulletins.** Rumor kills. Every notice has a real name, a level, a locality, and an expiry.

**Your look.** Each person owns their own theme (`/theme`): colors for light and dark, fonts, base size, radius, page width, scheme. It is a set of CSS custom properties validated by kind (`src/lib/theme.ts`) and re-serialized before injection, so a theme can never carry scripts or `url()` calls. The CSS shown in the editor is the CSS applied; both the controls and the text are live. There is deliberately no site-wide theme: no masters, not even over colors.

**Geography.** At join a person places a pin on an OpenStreetMap layer (`src/components/location-picker.tsx`): no address field, no geocoder, no GPS unless they press the optional button, and the numbers can be typed by hand when there are no tiles. The pin is rounded to three decimals (~100 m); a person can move it from their profile when they move house, and records they already published keep the pin they had. Others never see it as a point, only as a distance. Things a person publishes inherit the pin and can be drawn on `/map`; the person cannot. Scope everywhere is Local (label) / Within 10 km (haversine, `src/lib/geo.ts`) / Everywhere. Tiles come from OpenStreetMap; `NEXT_PUBLIC_TILE_URL` points at a local tile server when the network is gone.

## 3. The priority ladder

| Tier | Horizon | Goal | Programs | Status |
|---|---|---|---|---|
| 0 Survive | days to weeks | alive, informed, findable | Board, Web of Trust, Bulletins, Skills registry | live |
| 1 Stabilize | weeks to months | exchange, share, repair | Grace, Hours, Commons, Circles | live (skeleton) |
| 2 Flourish | months onward | durable, teachable, capture-resistant | Assemblies (live), Rotas, Library, Mesh sync, Apprenticeships | partly live |

The order is not arbitrary. Tier 0 is what a group of strangers needs in the first week. Tier 1 is what stops Tier 0 from decaying into hoarding and feuds. Tier 2 is what stops Tier 1 from being captured by whoever is most organized.

## 4. Threat model

| Threat | What the skeleton does | What to build next |
|---|---|---|
| Fake identities (sybils) | Unverified people get no credit, cannot vouch, keep, or vote. Verification needs vouches from *verified* locals, scaling with the locality. Dividends go only to verified members. | Detect vouch rings (mutual-only clusters). Decay verification when vouchers fall. |
| Strongman capture | No admin role exists. Standing has diminishing returns and gates only credit. Keepers cannot be parties. | Rotas with enforced rotation. Consent-based assemblies. Standing decay so nobody coasts on old status. |
| Server seizure | Runs anywhere with Docker and one env file. No secrets beyond a session key. | Signed records, export/import, node-to-node sync (Tier 2 Mesh). |
| Surveillance | No email, no phone, no address, no geocoder. GPS only on an explicit button press. Pins rounded to ~100 m; people never drawn on the map, only distances shown. Passwords hashed with bcrypt cost 12. | Encrypted volumes. Tor/I2P access. Local tile server. Optional coarser pin (1 km) per person. |
| Panic and rumor | Bulletins carry a real name and an expiry. Hazard and Urgent levels are visually distinct. | Corroboration: a second person with standing confirms before Urgent is shown everywhere. |
| Scarcity conflict | Survival needs sort first on the board and the home page. Commons have stewards and rules. Circles exist. | Borrow logs for commons. Need deadlines and urgency. Locality filters everywhere. |
| Credit abuse | Hard limit from standing. Full history visible. Demurrage on positives, paid out as a dividend. | Standing decay for long-term deep negatives. |
| Password loss | No reset by design (a reset channel is an attack channel). | A re-vouched identity claim: three existing vouchers confirm a new account is the same person; history is linked, not transferred. |

## 5. Execution plan

**Phase A: skeleton.** Done. Auth, schema, all Tier 0 and Tier 1 flows end to end, seed data, this document.

**Phase B (offline & integrity, built together):**
- **B1 Trust preview** (`src/lib/trust.ts`): see what someone owes before you extend credit, on the ledger page.
- **B2 Tamper-evident ledger** (`src/lib/hashlog.ts`, `LedgerLog`): sha256 hash chain over every economic event, appended in-transaction; root shown on the ledger; `verifyLedger` re-derives it; backfill script for history.
- **B3 Offline vouchers** (`Voucher`, `src/lib/voucher.ts` + `.shared.ts`): Ed25519-signed bearer notes (commons key from SESSION_SECRET), issue/redeem/void, single-use nonce, QR print page, zero-sum extended to include reserved vouchers. This is "signed monopoly money": a signature, not a bare hash, makes it verifiable offline and double-spend detectable.
- **B4 Jubilee / wind-down** (`src/lib/jubilee.ts`, `/wind-down`): a mirror proving dissolution returns everyone to zero and seizes nothing.
- **B5 Cash / hash-commitment notes** (`CashNote`, `src/lib/cash.ts`, `/cash`): the self-custody step. The holder's browser makes a secret and hashes it; the server stores only the commitment and can never spend the note. Mint burns value to the commitment; revealing the secret reclaims it; single-use, denomination bound into the hash. This is "write down a hash, destroy it in the system, reclaim it" - and the honest answer to server-held voucher keys.

Next (Phase D, not yet built): member-held Ed25519 keys for true self-custody and node-to-node signed sync; ZK anonymous credentials for ID.me-style proof without linking legal identity.

**Grace decimalized to cents (done).** Grace is stored in hundredths; transfers and board prices take two decimals; cash notes are any whole denomination 1-100. Migration: `npm run migrate:grace-cents` (guarded, scales x100, re-derives the hash chain in place).

**Show the work (done).** `/explain` walks through standing, the vouch threshold, credit limits, the mediator pool, the last demurrage run and the zero-sum check with the member's real inputs. Steps are produced by the same code path as the decision (`worked.ts`), so they cannot drift. Also fixed: the wind-down report counted locked cash in whole Grace instead of cents.

**Commons that can survive (done).** The tragedy of the commons is what happens to a shared thing with a name and nothing else, which is what the Commons page was. Now each has a record where anyone who takes, uses, returns or tends it says so with no approval (Ostrom's monitoring, done by the users); its users are the people in that record; they, not the steward alone, change its rules by ranked choice, and the software carries the result out when voting closes because nobody else can; a steward can hand over to someone who accepts, and after sixty days of silence its users choose who tends it (fixing the ghost-steward dead end a no-admin design otherwise has); and anyone can leave one public word about an entry at no cost to anyone's standing, the step before a dispute. The critic gained a seventh finding for shared things nobody is watching. Refused: rationing, stock counts, automatic penalties, and recall of an active steward. Found on the way: MongoDB null filters were hiding every notice with no expiry, now fixed and held by `smoke:where`.

**Usual prices (done).** The water-diamond problem without a price-setter. In a shortage a market hands the last jug to whoever pays most, and this design has no authority that could cap a price. So it removes what overcharging depends on: listings show what their category has recently settled for nearby (a median, so one exploitative sale cannot move it; shown only from three exchanges, which is also a privacy floor), an offer of a survival good asking over twice that carries a plain note that accuses nobody, survival listings start as a gift and care listings in Hours, and the ledger shows which kinds of exchange people say helped most beside what they usually cost. A cap was refused: it needs an enforcer and pushes scarce goods off the record.

**Words explained where they appear (done).** The app has its own vocabulary (Grace, vouch, standing, demurrage, mediator, steward, commitment...), and a tired person meeting it for the first time should not have to leave the page to learn what it means. An (i) beside each such word opens one plain sentence, with the fuller story under "More about ..." and a link to the page where you can see it for yourself (`src/lib/glossary.ts`, `src/components/info-dot.tsx`). It uses the browser's popover layer so no card can clip it, flips above when there is no room below, and works by hover, tap and keyboard. `PageTitle` and `Field` take `info`, because an (i) inside a `<label>` would steal the input's clicks and name. `smoke:glossary` fails if a term is never shown, a link goes nowhere, or a number in an explanation disagrees with the constant the code uses.

**Only real figures in production (done, 2026-09-21).** Checked the live database read-only: none of the seed and no test records (4 accounts, 1 transfer, 1 cash note, all real, all already in hundredths). Nothing stopped it from happening, though: the seed had no guard and would have created five demo neighbors with a published password on any server with `NODE_ENV=production`, and the smoke tests create shared things, ballots, transfers and notes against whatever database they are given. Now the seed and every smoke script import `scripts/not-production.ts` first and refuse production before connecting (`productionReason`, `src/lib/database-target.ts`; no override). Found on the way: prod had no `grace-cents` migration record, so `migrate:grace-cents` would have multiplied its real balances by 100; it now refuses any database that recorded Grace after the change (`whyNotScale`), with `--mark-applied` for recording it. The theme preview showed made-up payments by `@ada` and `@bo`, which anyone could register; it now says it is made up and uses names no username can hold. `smoke:prod` holds all of it, and the manifest gained the principle `real-figures`.

**Secret ballots (done, 2026-09-21).** Ballots used to be stored beside the voter's id, so anyone reading the database (the operator, or whoever seized it) could see how each person voted. Now the voter roll says only who voted, and the question holds sealed ballots (a ranking and the fingerprint of a key only the voter's browser has, no person, no time), reshuffled on every write. Changing a ballot takes the key itself. Eligibility moved to the moment of casting, since a sealed ballot cannot be struck out later. Stated limit: the server handles each ballot while the voter is signed in, so a live operator logging requests could still link them; closing that needs blind signatures and an unlinked channel (not built). No existing ballots needed migrating. `smoke:ballots` (23 checks) and an end-to-end browser run: cast, reload, change, lose the key, paste it back.

**Onion address (done, app side, 2026-09-21).** The app now works correctly when reached through a Tor onion service and offers it to Tor Browser from the regular site (`Onion-Location`). Without this it would have broken itself: the CSP's `upgrade-insecure-requests` sends every script to https://...onion, and all Tor visitors share one address, so per-address login limits would lock them out together. An onion visit is recognised by its Host and an all-loopback forwarded chain (Next.js fills X-Forwarded-For from the socket, found while testing), which also defeats a forged `X-Forwarded-For: 127.0.0.1` sent through a proxy. The hosted deployment cannot run Tor beside the app, so the address itself needs a community-run node; docs/onion.md covers how onion services work and the setup. `smoke:onion` checks the address checksum against real published onion addresses.

**Claim audit (done).** `npm run audit:claims` checks the manifest two ways: it runs the checks each claim names (proof of the mechanical claims), then sends each claim plus that evidence to TypeSafe System One, whose questions have fixed answer spaces and return calibrated probabilities. It reads the prose a schema cannot: is a limitation section candid or marketing, does an answer oversell, is a limitation missing, does the provenance soften the AI authorship. Findings only; nothing in the app consults a model.

**Self-description (done).** `/about` states the mission, the principles with what would falsify each, every capability with what it cannot do, the provenance (written by Claude directed by one person; no outside audit), and the sources. It is generated from a typed manifest whose schema refuses a capability without a limitation, a principle without a falsification condition, or an answer without its limits, so honesty about limits is structural rather than remembered. `/api/about` serves it as JSON for other nodes and researchers.

**Map looks and depth (done).** The map is themed per person: presets (Cypherpunk by default: near-black ground, glowing cyan roads; Paper, Blueprint, Phosphor) or any color, with a glow width and a picture-tile filter for the raster fallback, previewed live in the theme editor. The pin picker always stays plain (decided 2026-09-21): under the Cypherpunk filter the join page opened on a black world map with no borders or names, which read as broken. The UI gained depth (an `elevation` token drives tinted shadows, gradient buttons, a glass header); `0px` returns it to flat.

**Self-hosted maps (done).** A community hosts one PMTiles file for its area (docs/maps.md: `pmtiles extract`, or its own shapefiles via ogr2ogr + tippecanoe); the app draws it on-device as outlines in each person's theme colors (three new tokens plus text/border/accent). Works without internet beyond the server, removes the tile bill and the OSM usage-policy problem. Raster tiles remain the fallback.

**Security hardening (done).** Per-address and per-username throttles on login and join (`AuthAttempt`, database-backed so it works serverless); 12-character password floor with a well-known-password and contains-username check; session versioning so a password change or "log out everywhere" kills every other cookie; a change-password flow (needs the current password; still no reset); the commons signing key seeded from `COMMONS_KEY_SEED` so it survives a `SESSION_SECRET` rotation; a per-request nonce CSP (`src/proxy.ts`) plus HSTS, nosniff, referrer and permissions policies. The CSP is the guard for member keys in the browser: no injected script can run.

**Phase D2: member-held identity keys (done).** Device-generated Ed25519 keys (`src/lib/keys.ts`, `/keys`); signed vouches verified against the member's public key and marked on person pages; `/api/trust/export` emits a trust bundle that `verifyTrustBundle` checks with no server. Anti-Sabul (unforgeable attribution) and anti-wall (federation-verifiable trust). Still commons-signed: the money ledger; per-record member signatures on transfers are the next step.

**The critic (done).** `/sabul` runs seven self-audit findings over live data (trust concentration, hoarding, vouch rings, channel capture, lottery skew, signature coverage, shared things nobody is watching) in Sabul's voice. Each finding ends with what one member can do about it, linked to the page where they do it (after Jemisin's "The Ones Who Stay and Fight": the utopia is maintenance, and the cost is borne by everyone who chooses to). The mechanism from that story is refused: there are no social workers, no role that acts on findings or removes people.

**Infrastructure funding (done, deliberately narrow).** `/support` is a tip jar (SUPPORT_URL) kept entirely apart from Grace. After a completed transfer the ledger shows one quiet line linking to it. A "buy Grace / 1% fee" payments API was declined: it would be unlicensed money transmission, create a seizable reserve, let wealth buy influence, and require KYC that contradicts the privacy design.

**Phase D1: portable ledger checkpoints (done).** `checkpoint.ts`/`.shared.ts`: the commons signs the Merkle root; `/api/ledger/export` downloads the full signed chain; `/verify` re-derives and checks it off-server with only the public key. The foundation for node-to-node sync and public root-anchoring. **Consolidation:** Cash supersedes Vouchers; `/vouchers` is retired to redeem-only and off the nav. Still ahead: member-held keys (per-user signing), blind-signature anonymous cash, node-to-node merge.

**Phase A9: seed bank & plant exchange.** Done. `SeedShare` + `SeedRequest` models and `src/lib/seeds.ts`. A grower shares a variety (form, type, open-pollinated, days to maturity, sow months); others request it, receive it (GIVEN), grow it, and return seed at harvest (RETURNED). Gift-first, locality-scoped, with a "sow this month" filter. Ties food resilience into the app.

**Phase A8: verifiable mediator lottery.** Done. Draws seed from the drand public randomness beacon: seed = sha256(disputeId + ":" + round randomness), deterministic draw over a deterministically ordered pool, all logged on the dispute (source, round, seed, pool, result) and shown on the dispute page. Falls back to a local seed only when the beacon is unreachable, and the log says so.

**Phase A7: optional ID.me affiliation verification.** Done, off by default (IDME_ENABLED). OIDC/OAuth code flow with PKCE; a person proves any enabled affiliation (nurse, responder, teacher, government - IDME_POLICIES; military was dropped on 2026-09-21 because a searchable list of soldiers and veterans is a target list in a seized database, and IDME_POLICIES cannot add it back); stores a date, an HMAC of the subject (one identity per account), and the confirmed affiliation handles. Affiliations are badges on profile and searchable in People, feeding the responder registry; the only standing effect is one extra counted vouch. The UI states the trade plainly.

**Phase A6: trade pulse.** Done. `Reflection` model + `src/lib/pulse.ts`: after a settled exchange each party answers "did this leave you better off?" (-2..+2); private per person, aggregate-only display on the ledger; never affects standing.

**Phase A5: match finding.** Done. `src/lib/matches.ts` finds counterpart listings (opposite kind, same category, same locality or within 10 km) and true reciprocal pairs (you offer what they need and they offer what you need), shown on the board and counted on Home. Planned next: parse wantsInReturn against categories; three-way rings.

**Phase A4: personal themes.** Done. `/theme`, validated tokens, live CSS.

**Phase A3: geography.** Done. Map pin at join, distances, near scope, `/map`.

**Phase A2: the six decisions.** Done (section 6): demurrage, accusation credit and outcomes, keepers by lot, immutable localities with scoping, scaling verification, ranked-choice assemblies.

**Phase B: harden Tier 0.** Need deadlines and urgency. Locality filter on board, people, bulletins. Corroboration for Urgent bulletins. Better error handling on forms (keep input on error). Done when: a newcomer can post a survival need and get a pledge within one screen, and nothing can be posted without a name attached.

**Phase C: deepen Tier 1.** Vouch weighting by voucher standing. Standing decay. Commons borrow log. Listing-linked settlement audit on the ledger page. Done when: the sum of all balances is asserted zero by a test, and a vouch ring of three fresh accounts cannot reach Neighbor tier.

**Phase D: survive the network.** Every record gets an author signature. Export the whole database to a signed bundle; import and merge one. Then node-to-node sync over LAN. Done when: two laptops with no internet can merge a week of divergent boards and ledgers without losing a transfer.

**Phase D3: federation (next; the merge rules, decided 2026-09-20).** Many small nodes, one per community, instead of one server: the cost floor becomes free tiers and the single point of seizure goes away. A node exports a signed bundle (what `/api/ledger/export` and `/api/trust/export` already emit, plus boards, bulletins, commons, seeds) and imports another node's. The merge rule per record type, chosen so a later local-first client can use the same rules:

| Record | Identity | Merge rule | Conflict |
|---|---|---|---|
| Member (public key, username, locality) | public key | union; a username is scoped to its home node (`ada@north-ridge`) | none: two nodes never own the same key |
| Vouch | (from key, to key) | union; a vouch is valid only with the voucher's signature | unsigned vouches do not travel |
| Listing, bulletin, commons, seed share | author key + record id | union, last-writer-wins on the author's own edits only | edits by anyone but the author are dropped |
| Transfer | both parties' signatures | union; each party's balance is recomputed from their own signed history | a payer whose signed transfers exceed their limit is flagged on both nodes and their standing takes the harm |
| Demurrage run | node id + date | never merged; each node melts its own members | none |
| Cash note | commitment | union; first valid reveal wins across nodes after sync | a double reveal is a dispute, capped at one note's denomination |
| Dispute, assembly | home node | never merged; visible read-only elsewhere | none |
| Standing | computed | never transferred; recomputed on each node from merged vouches, scoped to the member's home locality | none |

Prerequisites, in order: (1) member-signed transfers (both parties sign the canonical transfer token, stored beside the record, verified on import); (2) a node identity (a node key derived like the commons key, published in the bundle) so records carry their origin; (3) `import` with the table above, idempotent, refusing anything unsigned; (4) a `/nodes` page listing peers and the last bundle exchanged. Done when: two nodes exchange bundles by file, each verifies the other's, a transfer signed on node A is credited on node B, and a forged transfer in a bundle is refused with its reason.

Refused, on purpose: a global ledger. Grace does not cross localities as a currency; it is a promise between people who can find each other. What federates is trust and information, and the bounded credit of members who chose to trade across nodes.

**Phase E: Tier 2.** Rotas, assemblies, library, apprenticeships, in that order.

## 6. Decisions on the open questions (2026-08-24)

These were open in the first draft. The owner decided them; they are now live.

- **Demurrage: yes.** Positive Grace decays 3% per 30 days (`src/lib/demurrage.ts`). What decays is paid out as an equal dividend to every *verified* member, so hoarding funds everyone and no pool or treasurer exists. The rounding remainder is carried forward; the zero-sum invariant is now `sum(balances) + latestRun.remainder == 0`. Runs lazily from the ledger page and from transfers; `npm run demurrage -- --force` runs it by hand.
- **Accusations are a currency.** Each person has an accusation allowance from standing (`circleAllowance`), spent while a circle they raised is open. Circles now close with an outcome: *harm found* (lowers the named person), *no harm*, or *unfounded* (lowers the raiser and permanently shrinks their allowance). That is what restrains someone who would use circles as a weapon.
- **Keepers by lot.** Keepers are drawn at random from the highest-standing verified people in the circle's locality (`src/lib/keepers.ts`). The pool is about 5 per 100 and grows with the square root of the population, so per head it shrinks and keeping becomes a craft. Drawn keepers may decline; the seat is redrawn. Keeping resolved circles raises standing.
- **Localities are named at join and changed when you move.** Required, anywhere in the world; editable on the profile along with the pin (decided 2026-09-20; the original rule was set-once). Everything is now scoped to the viewer's locality by default with an *Everywhere* toggle: board, bulletins (which may also be posted everywhere), commons, circles, people, assemblies. Honesty about where you are is what makes local vouches, keepers and votes mean anything.
- **Verification threshold scales with the locality.** A person is verified when vouches from verified locals reach `round(sqrt(population)/3)`, floored at 1 and capped at 7 (1 at 5 people, 3 at 100). While a locality has fewer verified people than that, every vouch counts (bootstrap). Unverified people can post, pledge and earn, but cannot go below zero, vouch, keep circles, propose, or vote.
- **Ranked-choice voting: live.** Assemblies (`/assemblies`) put a question to a locality; verified locals rank options; instant-runoff tally (`src/lib/rcv.ts`) shown after close.

Still open:

- Should verification also decay if your vouchers lose standing? Probably; today a vouch counts as long as the voucher was verified at the last computation.
- Should the keeper lot weight by standing, or stay uniform within the pool? Uniform for now.
- Federation between localities (shared bulletins, cross-locality circles) is still just the Everywhere toggle, now joined by a 10 km radius.
- Should people be able to choose a coarser pin (1 km) at join? Cheap to add; default stays 100 m.
- Offline tiles: bundle a small MBTiles set for the locality in the mesh phase.

## 7. How to use this document

Read section 1. Pick the next task from section 5. Check it against section 4. Build it. Update the Program Catalog and this file. Repeat.
