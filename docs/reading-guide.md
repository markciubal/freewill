# Reading the code

This is a guide for someone who wants to check what the app does, not just use
it. You do not need to be a programmer. Each rule the app applies lives in one
short file, written so the process reads top to bottom, and each has a test
that says in plain words what it checks. If the app ever claims something you
doubt, this is how to find the claim's source.

## The three ways to check a claim without reading code

1. **Show the work** (`/explain`): your standing, credit limits, the mediator
   pool, the last demurrage run and the zero-sum check, step by step with your
   real numbers. The steps are produced by the same code that makes the
   decision, so the page cannot say one thing while the app does another.
2. **Verify ledger** (`/verify`): re-derives the whole hash chain of economic
   events. If any past transfer was edited, the chain breaks at that point and
   the page says where.
3. **The critic** (`/sabul`): six measurements of where power could be
   pooling, with the thresholds printed in `src/lib/sabul.ts`.

## Where each ground rule lives

| Rule, in plain words | File | The function to read | Test |
|---|---|---|---|
| Standing is computed, never assigned; it gates only credit | `src/lib/standing.ts` | `computeStandingWithWork` (constants in `STANDING_RULES`) | `smoke:explain` |
| How many vouches make a verified person | `src/lib/standing.ts` | `requiredVouchesFor` | `smoke`, `smoke:explain` |
| Only vouches from verified locals count (rings cannot self-verify) | `src/lib/standing.all.ts` | `getStandingInputs` | `smoke` |
| A transfer debits one person and credits another, never mints | `src/lib/ledger.ts` | `transfer` | `smoke`, `smoke:hashlog` |
| Positive Grace melts 3% a month; the melt is shared equally | `src/lib/demurrage.ts` | `maybeRunDemurrage`, `decayFor` | `smoke:explain` |
| The books always sum to zero | `src/lib/explain.ts` | `zeroSumParts`, `explainZeroSum` | `smoke:explain`, `smoke:cash` |
| Mediators are drawn by public lottery, never chosen | `src/lib/keepers.ts`, `src/lib/beacon.ts` | `fillKeepers`, `seededDraw` | `smoke:lottery` |
| Every economic event is chained so history cannot be quietly edited | `src/lib/hashlog.ts` | `appendLog`, `verifyLedger` | `smoke:hashlog` |
| A checkpoint of the ledger can be verified with no server | `src/lib/checkpoint.shared.ts` | `verifyExportedBundle` | `smoke:checkpoint` |
| Cash notes: a secret hashed on your device, value locked until reveal | `src/lib/cash.ts` | `commitmentOf`, `parseNoteToken` | `smoke:cash` |
| Your vouches are signed with a key only you hold | `src/lib/keys.ts` | `signMessage`, `verifyTrustBundle` | `smoke:keys` |
| Where power could creep in | `src/lib/sabul.ts` | `critique` (thresholds in `CRITIC_THRESHOLDS`) | `smoke:keys` |
| Passwords, throttles, sessions, browser security headers | `src/lib/security.ts` | `passwordProblem`, `rateLimitAllows`, `sessionIsCurrent`, `buildContentSecurityPolicy` | `smoke:security` |
| The map is drawn from data the community hosts, in your colors | `src/lib/map-theme.ts`, `src/components/basemap.ts` | `paletteFromTokens`, `addBasemap` | `smoke:map` |
| Ranked-choice decisions | `src/lib/rcv.ts` | `tallyIRV` | `smoke:rcv` |
| What the app claims about itself, with limits and sources | `src/lib/manifest.ts` | `MANIFEST` (shape in `manifest.schema.ts`) | `smoke:about` |
| Whether the claims are honest, audited by a second reader | `src/lib/audit.questions.ts` | `buildClaimAudits`, `readAnswer` | `smoke:audit` |
| The wind-down costs no one anything | `src/lib/jubilee.ts` | `windDownReport` | `smoke:jubilee` |

## How to read one of these files

- The comment at the top says what the rule is for and, where the process has
  several steps, lists them in order. The code below follows that order.
- Variables are named for what they hold (`daysSincePreviousRun`,
  `verifiedMemberIds`, `remainderCarriedForward`), not abbreviated.
- Anything that needs the database is separated from the arithmetic. The
  arithmetic is in functions with no database access, so tests can feed them
  numbers directly and so the "Show the work" page can run them again.
- Constants that shape a rule sit together at the top of the file in one named
  object (`STANDING_RULES`, `CRITIC_THRESHOLDS`, `RATE_LIMITS`). The text a
  member sees is generated from those same constants.

## How to run the checks yourself

```sh
npm run smoke:explain     # the worked explanations reproduce every decision
npm run smoke:security    # passwords, throttles, sessions, headers
npm run smoke:hashlog     # the chain detects an edited record
```

Every `smoke:*` script prints one line per check, `ok:` or `FAIL:`, in plain
English. Running them needs the development database (`npm run db:local`).

## What to do if you find the app breaking its own rules

Open a dispute. That is not a joke: the app has no administrator to report to,
and a rule that is broken in the code is a harm done to everyone who relied on
it. A mediated dispute about the software, with the evidence from `/explain` or
`/verify`, is how a community without an authority corrects its tools. Then
fix the code, and add a check to the matching `smoke:*` script so it stays
fixed.
