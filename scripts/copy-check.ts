// Sentences the app assembles from pieces, checked as sentences: what a person
// reads when a form is wrong, how the mediator pool is described at every
// size, and whether the arithmetic "Show the work" prints is true as printed.
// Run: npm run smoke:copy
import { z } from "zod";
import { explainDemurrageRun, explainZeroSum } from "../src/lib/explain";
import { firstIssue } from "../src/lib/form";
import { KEEPERS_PER_CIRCLE, keeperPoolSize, mediatorPoolSentence } from "../src/lib/keepers";
import { computeStandingWithWork } from "../src/lib/standing";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

const reads = (message: string) => /^[A-Z]/.test(message) && /[.!?]$/.test(message) && !/\b[a-z]+[A-Z]\w*:/.test(message);

// A failed form reads as a sentence, never as zod's own wording.
const listing = z.object({
  title: z.string().trim().min(3).max(80),
  priceGrace: z.coerce.number().min(0).max(100000).optional(),
  kind: z.enum(["OFFER", "NEED"]),
  closesInDays: z.coerce.number().int().min(1).max(30),
  options: z.array(z.string()).min(2).max(10),
  someNewField: z.string().min(1),
});
const valid = { title: "Firewood", kind: "NEED", closesInDays: 3, options: ["a", "b"], someNewField: "x" };
const messageFor = (input: Record<string, unknown>) => {
  const result = listing.safeParse({ ...valid, ...input });
  return result.success ? "" : firstIssue(result.error);
};
const cases: [string, Record<string, unknown>, string][] = [
  ["a short title", { title: "ab" }, "Title needs at least 3 characters."],
  ["a long title", { title: "x".repeat(81) }, "Title can be at most 80 characters."],
  ["no type chosen", { kind: undefined }, "Type: choose one of the options."],
  ["too many days", { closesInDays: 90 }, "Days open can be at most 30."],
  ["a price that is not a number", { priceGrace: "lots" }, "Grace ask must be a number."],
  ["one option", { options: ["only"] }, "The list of options needs at least 2 entries."],
  ["an unlisted field left empty", { someNewField: "" }, "Some new field is required."],
];
for (const [label, input, expected] of cases) {
  const got = messageFor(input);
  assert(got === expected, `${label} reads "${got}"`);
}
const custom = z.object({ locality: z.string().min(2, "Locality: say where you are") }).safeParse({ locality: "x" });
assert(!custom.success && firstIssue(custom.error) === "Locality: say where you are.", "a message written in the app is shown as written, with a period, and without the field name bolted on the front");
assert(cases.every(([, input]) => reads(messageFor(input))), "every validation message starts with a capital, ends with a period, and contains no code names");

// The mediator pool, described truthfully at every size.
for (const population of [1, 2, 3, 5, 9, 40, 100, 400, 1600]) {
  const sentence = mediatorPoolSentence(keeperPoolSize(population), population);
  const nonsense = /\b(\d+) of (\d+)\b/.exec(sentence);
  assert(reads(sentence) && !(nonsense && Number(nonsense[1]) >= Number(nonsense[2])), `${population} ${population === 1 ? "person" : "people"}: "${sentence}"`);
}
assert(mediatorPoolSentence(keeperPoolSize(2), 2).includes("other localities") && KEEPERS_PER_CIRCLE === 3, "a place too small to seat three mediators says they come from elsewhere too");

// "Show the work": the arithmetic printed is true as printed.
const run = { ranAt: new Date(), days: 30, rateMonthly: 0.03, totalDecayed: 52, members: 4, dividend: 13, remainder: 1 };
const demurrage = explainDemurrageRun(run, 1);
const [pot, share, carried] = demurrage.steps;
assert(pot.shown === "0.53 Grace" && share.shown === "0.13 Grace" && carried.shown === "0.01 Grace", `results are shown in Grace, not hundredths: ${pot.shown}, ${share.shown}, ${carried.shown}`);
assert(pot.result === 53 && share.result === 13 && carried.result === 1, "the recorded results stay exact, in hundredths, so they can be checked against the run");
const division = /([\d.]+) ÷ (\d+) = ([\d.]+), rounded down to the cent/.exec(share.rule);
assert(!!division && Math.abs(Number(division[1]) / Number(division[2]) - Number(division[3])) < 1e-9 && Math.floor(Number(division[3]) * 100) / 100 === 0.13, `the share rule is true as written: "${share.rule}"`);
const subtraction = /([\d.]+) − ([\d.]+) × (\d+)/.exec(carried.rule);
assert(!!subtraction && Math.abs(Number(subtraction[1]) - Number(subtraction[2]) * Number(subtraction[3]) - 0.01) < 1e-9, `the carry rule is true as written: "${carried.rule}"`);

const { work } = computeStandingWithWork({ vouchesReceived: 3, vouchesFromVerified: 3, vouchesGiven: 1, pledgesKept: 0, transfers: 2, circlesKept: 1, harms: 0, unfounded: 0, memberDays: 10, localityPopulation: 2, bootstrap: false });
const limit = work.find((step) => step.label.startsWith("Grace credit limit"))!;
assert(limit.shown === "52.00 Grace" && limit.result === 5200 && limit.rule === "20 + round(21 × 1.5) Grace", `the credit limit reads "${limit.rule} = ${limit.shown}", and 20 + round(31.5) is 52`);

const zero = explainZeroSum({ graceBalances: -1, hoursBalances: 0, carriedRemainder: 1, reservedInVouchers: 0, lockedInCash: 0 });
assert(zero.steps[0].shown === "0.00 Grace" && zero.balances, "the books-balance total is shown in Grace");
