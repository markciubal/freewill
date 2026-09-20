<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Freewill project conventions

Read BUILD_PROMPT.md first. It is the constitution and the task list.

- **No authority.** Never add an admin, moderator, or issuer role. Decisions come from a computed rule (`src/lib/standing.ts`), a steward accountable via standing, or a circle.
- **Ledger invariants.** Every balance change goes through `transfer()` in `src/lib/ledger.ts` inside a transaction. Sum of all balances on each ledger must stay zero. Hours are stored in minutes.
- **Auth.** Username + password only (`src/lib/auth.ts`). No email, no resets, no OAuth. Use `requireUser()` in server components and actions; never trust client input for identity.
- **Server actions.** One `actions.ts` per area under `src/app/(app)/<area>/`. Validate with zod. Errors redirect back with `?error=` via `fail()` from `src/lib/form.ts`; success with `ok()`. Guard ObjectIds with `isObjectId()` before `findUnique`.
- **Next 16.** `params` and `searchParams` are Promises. `cookies()` is async. Use `LayoutProps`/explicit prop types.
- **Prisma 6 + MongoDB.** Enums and `String[]` are fine. `$transaction` requires a replica set. IDs are ObjectId strings.
- **UI.** Use the primitives in `src/components/ui.tsx`. Copy addresses a tired, frightened person: short, plain, civic, tells them what to do next. Never vow-like or in-group ("affirm", "give my word", mottoes). Code names differ from UI labels: covenant = "ground rules", Circle = "dispute", keeper = "mediator" — keep code identifiers, translate in UI strings. Survival categories (`SURVIVAL` in covenant.ts) sort first.
- **After any feature work,** update `src/lib/covenant.programs.ts` (live/planned) and BUILD_PROMPT.md section 5.
- **Verification and locality.** `locality` is required and immutable. Use `getStanding` from `src/lib/standing.all.ts` (bulk, locality-aware); `standing.verified` gates credit, vouching, keeping, proposing, voting. Scope lists with `readScope`/`scopeWhere` from `src/lib/form.ts`.
- **Demurrage.** `maybeRunDemurrage()` is idempotent per 30 days; the zero-sum check must include `latestRun().remainder`.
- **Keepers are drawn, never chosen.** Use `fillKeepers()` from `src/lib/keepers.ts`; never add a self-selection path.
- **Geography.** `lat`/`lng` on User are set once at join (rounded via `roundPin`). Never render a person as a map point; show `fmtDistance(haversineKm(me, them))`. Records people publish copy `me.lat/me.lng` at creation. Use `applyNear` for the "near" scope; never add a geocoder or automatic geolocation.
- **Theming.** UI colors/type/shape come only from the custom properties in `src/lib/theme.ts` (`--background`, `--accent`, `--warn`, `--radius`, `--font-size`, `--content-width`...). Use token utilities (`bg-card`, `text-warn`, `rounded-md`, `max-w-(--content-width)`), never hard-coded palette classes like `amber-600`. Per-person themes are validated by `sanitizeTheme` and injected from the root layout; never inject raw user CSS.
- **Grace amounts.** Grace is stored in **cents** (hundredths). Human input is multiplied by 100 in actions; display divides by 100 via `fmtGrace`/`<Grace n={cents} />` (n is cents). Standing `graceLimit` is in cents. Hours stay in minutes. Cash `denomination` is whole Grace (1-100); multiply by 100 for money math and display. Never pass whole Grace to `<Grace>`.
- **Databases.** `src/lib/db.ts` picks `DATABASE_URL_PROD` when `NODE_ENV=production`, else `DATABASE_URL_DEV`, falling back to `DATABASE_URL`. Scripts that make their own PrismaClient must use `databaseUrl()` from db.ts. Never seed or reset prod.
- **Trade pulse.** Reflections (`src/lib/pulse.ts`) measure welfare, never people: show aggregates only, never per-person answers, and never let them feed standing or any ranking.
- **ID.me affiliation verification (exception to "no OAuth").** Attestation only, never login, behind IDME_ENABLED (default off); policies configurable via IDME_POLICIES. Store only `humanVerifiedAt`, `idmeHash` (HMAC of subject, one identity per account), and `affiliations[]` (policy handles). Its only mechanical effect is one extra counted vouch; affiliations are badges and responder-registry signal, never power, and never gate credit, disputes, proposing, or voting.
- **Mediator lottery.** Draws are seeded from the drand beacon via `fetchBeacon`/`seededDraw` (src/lib/beacon.ts) and logged to `Circle.drawLog` (source, round, seed, pool, drawn). Never use Math.random for the lot; keep draws recomputable from the log.
- **Seed bank.** Varieties are `SeedShare`; borrow/return is `SeedRequest` (REQUESTED -> GIVEN -> RETURNED). Gift-first: no Grace pricing. Pure labels and seasonal logic in `src/lib/seeds.ts`; copy pins/locality from the steward at creation like other published records.
- **Tamper-evident ledger.** Every economic event appends to the hash chain via `appendLog` (`src/lib/hashlog.ts`) inside the same transaction as the record. Ledger records are append-only: never delete transfers/adjustments/vouchers in app code (only test teardown does, cleaning its own tail log entries). `verifyLedger` re-derives and checks the chain.
- **Vouchers.** Signed by the commons key derived from SESSION_SECRET (`src/lib/voucher.ts`, secret; pure crypto in `voucher.shared.ts`). Issue debits the issuer (a reservation, respecting standing limits); redeem credits the redeemer; the nonce is single-use so double-spend is detected. Zero-sum now includes outstanding ISSUED vouchers. Bare hashes prove nothing; always sign.
- **Trust preview.** `getTrustPreview`/`trustFlags` (`src/lib/trust.ts`) show only already-public signals before a transfer. Never surface anything private.
- **Jubilee.** `windDownReport` (`src/lib/jubilee.ts`) is a read-only mirror; wind-down is never an executable action in the app.
- **Cash (hash-commitment notes).** `src/lib/cash.ts` is pure (no db, safe for the browser); the secret is generated and hashed client-side in `mint-cash.tsx` and only the commitment reaches the server (`mintCash`). Never store or log the secret. Reclaim hashes the revealed secret to find the LOCKED commitment; first reveal wins. Keep `commitmentInput` byte-identical to the client's WebCrypto input. Zero-sum now also includes LOCKED cash denominations.
- **Checkpoints & export.** `src/lib/checkpoint.ts` (server: sign/export, reuses the commons key) + `checkpoint.shared.ts` (pure verify). `exportLedger` emits the hash chain + a signed checkpoint; `verifyExportedBundle` re-derives it with no DB. Export reveals only commitments, never who-paid-whom. `/verify` and `/api/ledger/export` are the UI.
- **Consolidation.** Cash (hash-locked, self-custody) is the promoted offline-money instrument. Vouchers are retired: `/vouchers` keeps redeem/void so outstanding notes settle, but minting is gone and it is off the nav. Do not build new voucher features.
