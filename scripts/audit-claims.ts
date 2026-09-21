// Audit the manifest's claims against the evidence the manifest itself names.
//
//   npm run audit:claims            gather evidence, ask the model, report
//   npm run audit:claims -- --dry   gather evidence and write the questions out,
//                                   without calling anything
//
// Two layers, and the difference between them is the point:
//
//   The deterministic layer runs the checks each claim names (a smoke script,
//   a page, a file) and records what happened. A passing script is a proof of
//   the mechanical claim it covers. This layer needs no network and no model,
//   and it runs first.
//
//   The judgment layer sends each claim, with that evidence as state, to
//   TypeSafe's System One model, which answers questions whose permitted
//   answers were fixed in advance and returns probabilities and confidence.
//   This layer reads the prose: whether the stated limitations are a real
//   disclosure, whether an answer oversells, whether the provenance softens
//   what it should say plainly. A probability is not a proof. It is a second
//   reader who did not write the text and cannot be embarrassed by it.
//
// Nothing here runs inside the app, and nothing in the app consults it. It is
// a build-time audit, like the critic page: findings for a person to read.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildClaimAudits, readAnswer, type Answer, type ClaimAudit, type QuestionSpec, type Verdict } from "../src/lib/audit.questions";
import type { Check } from "../src/lib/manifest.schema";

const root = path.resolve(__dirname, "..");
const dryRun = process.argv.includes("--dry");
const outputPath = path.join(root, "audit-claims.json");
const packageScripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts as Record<string, string>;
const tsxCli = path.join(root, "node_modules/tsx/dist/cli.mjs");

// ---------------------------------------------------------------------------
// Layer one: evidence, gathered without a model.
// ---------------------------------------------------------------------------

type Evidence = { ref: string; kind: Check["kind"]; what: string; outcome: "passed" | "failed" | "read" | "missing"; detail: string };

const scriptResults = new Map<string, { passed: boolean; detail: string }>();

// Run a smoke script once, however many claims name it, and keep its output.
function runScript(name: string): { passed: boolean; detail: string } {
  const cached = scriptResults.get(name);
  if (cached) return cached;
  let result: { passed: boolean; detail: string };
  try {
    // Run the script the way its package.json entry says to, but through node
    // directly rather than through npm. Spawning npm means spawning a shell on
    // Windows, and a shell here would mean pasting strings into a command
    // line. Every smoke script is "tsx [flags] scripts/x.ts", so node can run
    // tsx's own entry point with the same arguments and no shell at all.
    const command = packageScripts[name];
    if (!command) throw new Error("no npm script by that name");
    const [runner, ...args] = command.split(" ");
    if (runner !== "tsx") throw new Error("this runner only knows how to run tsx scripts");
    const output = execFileSync(process.execPath, [tsxCli, ...args], { cwd: root, encoding: "utf8", timeout: 240_000 });
    const checks = output.split("\n").filter((line) => line.startsWith("ok:"));
    const failures = output.split("\n").filter((line) => line.includes("FAIL"));
    result = {
      passed: failures.length === 0,
      detail: failures.length
        ? `${failures.length} failed: ${failures.slice(0, 3).join(" | ")}`
        : `${checks.length} checks passed:\n${checks.slice(0, 12).join("\n")}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result = { passed: false, detail: `the script did not complete: ${message.split("\n")[0]}` };
  }
  scriptResults.set(name, result);
  return result;
}

function gather(check: Check): Evidence {
  if (check.kind === "script") {
    const { passed, detail } = runScript(check.ref);
    return { ref: check.ref, kind: check.kind, what: check.what, outcome: passed ? "passed" : "failed", detail };
  }
  if (check.kind === "file") {
    const filePath = path.join(root, check.ref);
    if (!existsSync(filePath)) return { ref: check.ref, kind: check.kind, what: check.what, outcome: "missing", detail: "no such file" };
    // Enough of the file for the claim to be judged against, not the whole thing.
    const contents = readFileSync(filePath, "utf8");
    return { ref: check.ref, kind: check.kind, what: check.what, outcome: "read", detail: contents.slice(0, 6000) };
  }
  // A page: confirm it exists. What it renders is covered by the smoke scripts.
  const segments = check.ref.replace(/^\//, "");
  const candidates = ["src/app", "src/app/(app)", "src/app/(auth)"].map((base) => path.join(root, base, segments, "page.tsx"));
  const found = candidates.find(existsSync);
  return {
    ref: check.ref,
    kind: check.kind,
    what: check.what,
    outcome: found ? "read" : "missing",
    detail: found ? readFileSync(found, "utf8").slice(0, 4000) : "no such page",
  };
}

// ---------------------------------------------------------------------------
// Layer two: the questions, sent with that evidence as state.
// ---------------------------------------------------------------------------

async function ask(audits: ClaimAudit[], evidenceByClaim: Map<string, Evidence[]>) {
  const sdk = await import("@typesafe-ai/sdk").catch(() => null);
  if (!sdk) {
    console.log("\n@typesafe-ai/sdk is not installed. Run `npm install --save-dev @typesafe-ai/sdk`, or use --dry.");
    return null;
  }
  if (!process.env.TYPESAFE_API_KEY) {
    console.log("\nTYPESAFE_API_KEY is not set, so the questions were not sent. The evidence and the full question set are in audit-claims.json; run it from anywhere, or set the key and try again.");
    return null;
  }
  const { choice, noul, score, TypeSafeClient } = sdk;
  const client = new TypeSafeClient();

  const toQuestion = (spec: QuestionSpec) => {
    if (spec.type === "choice") return choice(spec.instructions, spec.criteria);
    if (spec.type === "noul") return noul(spec.instructions, spec.criteria);
    return score(spec.instructions, spec.criteria);
  };

  const results: { id: string; claim: string; findings: { verdict: Verdict; reading: string }[] }[] = [];
  for (const audit of audits) {
    const questions = Object.fromEntries(Object.entries(audit.questions).map(([key, spec]) => [key, toQuestion(spec)]));
    try {
      // Every question for one claim in a single call: the parallel pattern
      // in the documentation, which is cheaper and faster than one at a time.
      const response = await client.systemOne({
        state: { ...audit.state, evidence: evidenceByClaim.get(audit.id) ?? [] },
        questions,
      });
      const findings = Object.entries(response.answers as Record<string, Answer>).map(([key, answer]) => readAnswer(key, answer));
      results.push({ id: audit.id, claim: audit.claim, findings });
    } catch (error) {
      results.push({ id: audit.id, claim: audit.claim, findings: [{ verdict: "needs-a-person", reading: `the question could not be asked: ${(error as Error).message.split("\n")[0]}` }] });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------

async function main() {
  const audits = buildClaimAudits();
  console.log(`Auditing ${audits.length} claims from the manifest.\n`);

  console.log("Gathering evidence (this runs the checks each claim names)...");
  const evidenceByClaim = new Map<string, Evidence[]>();
  for (const audit of audits) evidenceByClaim.set(audit.id, audit.evidenceFrom.map(gather));

  const allEvidence = [...evidenceByClaim.values()].flat();
  const failed = allEvidence.filter((item) => item.outcome === "failed" || item.outcome === "missing");
  const scriptsRun = [...scriptResults.entries()];
  console.log(`  ${scriptsRun.length} checks run, ${scriptsRun.filter(([, result]) => result.passed).length} passed.`);
  console.log(`  ${allEvidence.length} pieces of evidence gathered for ${audits.length} claims.`);
  if (failed.length) {
    console.log("\n  PROVEN FALSE: a claim names evidence that does not hold.");
    for (const item of failed) console.log(`    ${item.kind}:${item.ref} — ${item.outcome}: ${item.detail.split("\n")[0]}`);
  } else {
    console.log("  Every check a claim names passes. The mechanical claims are proved; the prose is what remains.");
  }

  // Always write the questions and evidence out, so the audit can be run
  // without this machine, this script, or this model.
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: "Questions auditing the claims in src/lib/manifest.ts, with the evidence each claim names. Shaped for TypeSafe System One (docs.typesafe.ai): every question's permitted answers are fixed in advance. Answers are evidence, never authority.",
        claims: audits.map((audit) => ({ ...audit, evidence: evidenceByClaim.get(audit.id) })),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nQuestions and evidence written to ${path.relative(root, outputPath)}.`);

  if (dryRun) {
    const questionCount = audits.reduce((sum, audit) => sum + Object.keys(audit.questions).length, 0);
    console.log(`Dry run: ${questionCount} questions across ${audits.length} claims, in ${audits.length} requests. Nothing was sent.`);
    return;
  }

  const results = await ask(audits, evidenceByClaim);
  if (!results) return;

  console.log("\nWhat the second reader said:\n");
  let findings = 0;
  let needsPerson = 0;
  for (const result of results) {
    const notable = result.findings.filter((finding) => finding.verdict !== "clean");
    if (!notable.length) continue;
    console.log(`  ${result.id}`);
    for (const finding of notable) {
      console.log(`    [${finding.verdict}] ${finding.reading}`);
      if (finding.verdict === "finding") findings++;
      else needsPerson++;
    }
  }
  const clean = results.length - results.filter((result) => result.findings.some((finding) => finding.verdict !== "clean")).length;
  console.log(`\n${clean} of ${results.length} claims came back clean. ${findings} findings, ${needsPerson} the model was not sure enough about to call.`);
  console.log("A finding is a second reader's opinion about prose, not a proof. The proofs are the checks above.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
