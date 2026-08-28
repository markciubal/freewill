# Freewill

A commons for a society without a state, where morality is the only law. Built to keep neighbors civil, fed, safe, and honest when the government is gone or has turned on them.

Read [BUILD_PROMPT.md](BUILD_PROMPT.md) for what this is and why. This file is how to run it.

## What is in the skeleton

| Area | Route | What it does |
|---|---|---|
| Covenant + join/login | `/`, `/join`, `/login` | Username, password, locality, and a map pin. No email, no address, no resets. |
| Home | `/home` | Your standing, balances, alerts, survival needs, pledges waiting on you. |
| Map | `/map` | Needs, offers, commons, hazards around you. People never drawn. |
| Board | `/board` | Needs and offers. Barter, Grace, Hours, or gift. Pledge, accept, confirm, settle. |
| Ledger | `/ledger` | Grace (mutual credit) and Hours (time bank). Pay by username. History. |
| People | `/people` | Directory, search by skill, profiles, vouching. |
| Commons | `/commons` | Shared resources with stewards and rules. |
| Circles | `/circles` | Restorative process for harm. Keepers drawn by lot, outcomes, accusation credit. |
| Assemblies | `/assemblies` | Locality questions decided by ranked-choice voting. |
| Bulletins | `/bulletins` | Signed notices and hazards with expiry. |
| Your look | `/theme` | Per-person colors, fonts, shape; live CSS editor. |
| Programs | `/programs` | The catalog of what matters and in what order. |

## Setup

Requirements: Node 20+, and MongoDB running **as a replica set** (Prisma needs one for transactions; the ledger uses them).

```sh
cp .env.example .env         # then set SESSION_SECRET to something long and random
npm install                  # also runs prisma generate
docker compose up -d         # local single-node replica set on :27017 (skip if you use Atlas)
npm run db:push              # create collections and indexes
npm run db:seed              # optional: five people, a valley, some history
npm run dev                  # http://localhost:3000
```

Seed logins: `ada`, `bo`, `cy`, `dee`, `eli`, password `freewill123`.

### Using an existing local MongoDB

If you already run `mongod` as a Windows service it is probably standalone. Prisma will refuse transactions with "Transaction numbers are only allowed on a replica set member". Either use the Docker compose above on a different port, or convert the service:

1. Add to `mongod.cfg`: `replication:\n  replSetName: rs0`
2. Restart the service.
3. `mongosh --eval "rs.initiate()"`

Then `DATABASE_URL="mongodb://localhost:27018/freewill?replicaSet=rs0&directConnection=true"`.

### MongoDB Atlas

Atlas clusters are replica sets already. Use the `mongodb+srv://` connection string.

## Databases per environment

`.env` holds two connection strings: `DATABASE_URL_DEV` (used by `next dev`) and `DATABASE_URL_PROD` (used by `next build` / `next start`). The app chooses by `NODE_ENV` in [src/lib/db.ts](src/lib/db.ts). The Prisma CLI reads plain `DATABASE_URL`, which you keep pointed at dev; `npm run db:push:prod` and `npm run db:studio:prod` run the CLI against the prod URL. There is deliberately no `db:seed:prod`: the seed is demo data.

## Scripts

| Script | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` / `db:push:prod` | Sync schema to the dev / prod MongoDB |
| `npm run db:seed` | Seed data |
| `npm run db:studio` | Prisma Studio |
| `npm run db:local` / `db:rs-init` | Project-local mongod replica set on :27018, then initiate it once |
| `npm run demurrage -- --force` | Apply demurrage now (normally runs itself every 30 days) |
| `npm run smoke` / `smoke:rcv` | Ledger invariants; ranked-choice tally and keeper-lot checks (need seed) |

## Layout

```
prisma/schema.prisma          the data model (the constitution, part 1)
src/lib/covenant.ts           covenant, categories, tiers (part 2)
src/lib/covenant.programs.ts  program catalog
src/lib/standing.ts           how standing is computed (part 3)
src/lib/ledger.ts             mutual-credit transfer, in a transaction
src/lib/auth.ts               session cookie, requireUser()
src/app/(auth)/               join, login, logout
src/app/(app)/<area>/         page.tsx + actions.ts per area
src/components/ui.tsx         the handful of UI primitives
```

## The Grace mark

Grace amounts are written with an olive-sprig mark, the way $ marks a dollar: `<Grace n={20} />` in JSX ([src/components/ui.tsx](src/components/ui.tsx)), the bare glyph as `<GraceMark />` ([src/components/grace-mark.tsx](src/components/grace-mark.tsx)), and a standalone file at [public/grace.svg](public/grace.svg). In plain text write `GRC`.

## Design rules (short version)

No admin. No issuer. No resets. Locality is set once. Standing is computed, never assigned. Verification scales with the locality. Sum of balances (plus carried demurrage remainder) is always zero. Harm goes to a circle whose keepers are drawn by lot. Survival needs first. See BUILD_PROMPT.md.
