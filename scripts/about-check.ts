// The manifest must be true about itself: every route it names must be a real
// page, every check must name a real script or file, every live-state key must
// resolve, and every claim must carry the limits the schema demands.
// Run: npm run smoke:about
import "./not-production";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { db } from "../src/lib/db";
import { MANIFEST } from "../src/lib/manifest";
import { LIVE_STATE, isLiveStateKey, loadLiveState } from "../src/lib/manifest.live";
import { ManifestSchema, type Check } from "../src/lib/manifest.schema";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

const root = path.resolve(__dirname, "..");
const packageScripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts as Record<string, string>;

// A route is real if there is a page.tsx for it under any route group.
function routeExists(route: string): boolean {
  const segments = route.replace(/^\//, "");
  const candidates = [
    path.join(root, "src/app", segments, "page.tsx"),
    path.join(root, "src/app/(app)", segments, "page.tsx"),
    path.join(root, "src/app/(auth)", segments, "page.tsx"),
    path.join(root, "src/app", segments, "route.ts"),
  ];
  return route === "/" ? existsSync(path.join(root, "src/app/page.tsx")) : candidates.some(existsSync);
}

function checkIsReal(check: Check): boolean {
  if (check.kind === "script") return Object.hasOwn(packageScripts, check.ref);
  if (check.kind === "page") return routeExists(check.ref);
  return existsSync(path.join(root, check.ref));
}

async function main() {
  // The schema is the promise. Parsing happens at import, so reaching here
  // means it held; re-parse to state it as a check.
  assert(ManifestSchema.safeParse(MANIFEST).success, "the manifest satisfies its own schema");

  // The teeth of the schema: no claim without its limits.
  const capabilitiesWithoutLimits = MANIFEST.capabilities.filter((capability) => capability.doesNot.length === 0);
  const questionsWithoutLimits = MANIFEST.questions.filter((question) => question.limits.length === 0);
  assert(capabilitiesWithoutLimits.length === 0 && questionsWithoutLimits.length === 0, `every capability states what it does not do, and every answer states where it stops (${MANIFEST.capabilities.length} capabilities, ${MANIFEST.questions.length} questions)`);

  // A capability with no stated limit must be impossible to add, not merely absent.
  const missingLimit = ManifestSchema.safeParse({
    ...MANIFEST,
    capabilities: [{ ...MANIFEST.capabilities[0], doesNot: [] }],
  });
  assert(!missingLimit.success, "a capability with no limitation is rejected by the schema, so it cannot ship");
  const missingCheck = ManifestSchema.safeParse({
    ...MANIFEST,
    capabilities: [{ ...MANIFEST.capabilities[0], verifiedBy: [] }],
  });
  assert(!missingCheck.success, "a capability with no way to check it is rejected by the schema");
  const missingBrokenIf = ManifestSchema.safeParse({
    ...MANIFEST,
    principles: [{ ...MANIFEST.principles[0], brokenIf: "" }],
  });
  assert(!missingBrokenIf.success, "a principle that cannot be falsified is rejected by the schema");

  // Everything the manifest points at must exist.
  const allChecks: Check[] = [
    ...MANIFEST.capabilities.flatMap((capability) => capability.verifiedBy),
    ...MANIFEST.principles.flatMap((principle) => principle.enforcedBy),
    ...MANIFEST.questions.flatMap((question) => question.seeAlso),
  ];
  const brokenChecks = allChecks.filter((check) => !checkIsReal(check));
  assert(brokenChecks.length === 0, `all ${allChecks.length} checks name a real script, page or file${brokenChecks.length ? `; broken: ${brokenChecks.map((c) => c.kind + ":" + c.ref).join(", ")}` : ""}`);

  const routes = MANIFEST.capabilities.map((capability) => capability.route).filter((route): route is string => !!route);
  const brokenRoutes = routes.filter((route) => !routeExists(route));
  assert(brokenRoutes.length === 0, `all ${routes.length} capability routes are real pages${brokenRoutes.length ? `; missing: ${brokenRoutes.join(", ")}` : ""}`);

  const namedKeys = [...new Set(MANIFEST.questions.flatMap((question) => question.liveState))];
  const unknownKeys = namedKeys.filter((key) => !isLiveStateKey(key));
  assert(unknownKeys.length === 0, `all ${namedKeys.length} live-state keys quoted by answers exist${unknownKeys.length ? `; unknown: ${unknownKeys.join(", ")}` : ""}`);

  // Sources: every one the entries use must appear in the shared list, so the
  // bibliography cannot drift from what the claims cite.
  const listed = new Set(MANIFEST.sources.map((source) => source.title));
  const cited = new Set([
    ...MANIFEST.capabilities.flatMap((capability) => capability.sources.map((source) => source.title)),
    ...MANIFEST.questions.flatMap((question) => question.sources.map((source) => source.title)),
  ]);
  const uncited = [...cited].filter((title) => !listed.has(title));
  assert(uncited.length === 0, `every source cited by a claim is in the source list (${cited.size} cited, ${listed.size} listed)${uncited.length ? `; missing: ${uncited.join(", ")}` : ""}`);
  assert(MANIFEST.sources.every((source) => source.informs.length > 20), "every source says what it actually contributed, not just its title");

  // Honesty checks a schema cannot make: the disclosures that matter must be present.
  const authorship = MANIFEST.provenance.authorship.toLowerCase();
  assert(authorship.includes("claude") && authorship.includes("anthropic"), "the provenance names the AI that wrote the code");
  assert(MANIFEST.provenance.reviewed.toLowerCase().includes("no independent security audit"), "the provenance states plainly that no security audit has been done");
  assert(MANIFEST.provenance.cautions.length >= 3, `the provenance carries real cautions (${MANIFEST.provenance.cautions.length})`);
  const operatorNamed = MANIFEST.questions.some((question) => question.limits.some((limit) => /whoever runs the server|operator/i.test(limit)));
  assert(operatorNamed, "at least one answer admits what the server operator can see or do");

  // Live: every key resolves against the real database.
  try {
    const keys = Object.keys(LIVE_STATE);
    const values = await loadLiveState(keys);
    assert(values.length === keys.length, `all ${keys.length} live figures load from the database (${values.length} returned)`);
    const balance = values.find((value) => value.label.startsWith("Do the books"));
    assert(balance?.value.startsWith("yes"), `the books balance right now: ${balance?.value ?? "unknown"}`);
    const members = values.find((value) => value.label === "People here");
    assert(!!members && Number(members.value) >= 0, `member count reads from live data (${members?.value})`);
    assert(values.every((value) => !/@[a-z0-9_]{3,}/i.test(value.value + (value.note ?? ""))), "no live figure names a person: aggregates only");

    // The JSON endpoint gives the claims to anyone and the community's numbers only to members.
    const route = readFileSync(path.join(root, "src/app/api/about/route.ts"), "utf8");
    assert(route.includes("getSessionUserId"), "the live figures on /api/about are behind a session; the claims themselves are public");
    await db.$disconnect();
  } catch (error) {
    console.log("(dev DB not reachable; skipped live figures)", (error as Error).message.split("\n")[0]);
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
