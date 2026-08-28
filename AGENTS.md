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
- **UI.** Use the primitives in `src/components/ui.tsx`. Copy addresses a tired, frightened person: short, plain, tells them what to do next. Survival categories (`SURVIVAL` in covenant.ts) sort first.
- **After any feature work,** update `src/lib/covenant.programs.ts` (live/planned) and BUILD_PROMPT.md section 5.
- **Verification and locality.** `locality` is required and immutable. Use `getStanding` from `src/lib/standing.all.ts` (bulk, locality-aware); `standing.verified` gates credit, vouching, keeping, proposing, voting. Scope lists with `readScope`/`scopeWhere` from `src/lib/form.ts`.
- **Demurrage.** `maybeRunDemurrage()` is idempotent per 30 days; the zero-sum check must include `latestRun().remainder`.
- **Keepers are drawn, never chosen.** Use `fillKeepers()` from `src/lib/keepers.ts`; never add a self-selection path.
- **Geography.** `lat`/`lng` on User are set once at join (rounded via `roundPin`). Never render a person as a map point; show `fmtDistance(haversineKm(me, them))`. Records people publish copy `me.lat/me.lng` at creation. Use `applyNear` for the "near" scope; never add a geocoder or automatic geolocation.
- **Theming.** UI colors/type/shape come only from the custom properties in `src/lib/theme.ts` (`--background`, `--accent`, `--warn`, `--radius`, `--font-size`, `--content-width`...). Use token utilities (`bg-card`, `text-warn`, `rounded-md`, `max-w-(--content-width)`), never hard-coded palette classes like `amber-600`. Per-person themes are validated by `sanitizeTheme` and injected from the root layout; never inject raw user CSS.
- **Grace amounts.** Render with `<Grace n={amount} />` (olive-sprig mark + number); use `fmtGrace()` only in plain-text contexts (titles, error strings). Never write a bare number for Grace.
- **Databases.** `src/lib/db.ts` picks `DATABASE_URL_PROD` when `NODE_ENV=production`, else `DATABASE_URL_DEV`, falling back to `DATABASE_URL`. Scripts that make their own PrismaClient must use `databaseUrl()` from db.ts. Never seed or reset prod.
