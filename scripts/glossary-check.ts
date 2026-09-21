// The (i) beside the app's words must explain something real: every term in
// the glossary is shown on some page, every term a page asks for exists, every
// "See ..." link goes to a real page, and the words read as plain sentences
// without the code's own names leaking through.
// Run: npm run smoke:glossary
import "./not-production";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { STEWARD_SILENT_DAYS } from "../src/lib/commons";
import { DEMURRAGE_INTERVAL_DAYS, DEMURRAGE_RATE_MONTHLY } from "../src/lib/demurrage";
import { GLOSSARY, type GlossaryEntry, type Term } from "../src/lib/glossary";
import { KEEPERS_PER_CIRCLE, keeperPoolSize } from "../src/lib/keepers";
import { HIGH_ASK_FACTOR, REFERENCE_MINIMUM_EXCHANGES, REFERENCE_WINDOW_DAYS } from "../src/lib/pricing";
import { STANDING_RULES } from "../src/lib/standing";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

const root = path.resolve(__dirname, "..");
const entries = Object.entries(GLOSSARY) as [string, GlossaryEntry][];

// Every .tsx file under src, read once.
function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) return tsxFiles(full);
    return item.name.endsWith(".tsx") ? [full] : [];
  });
}
// Comments are dropped so a comment that mentions <label> or an (i) does not count.
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sources = tsxFiles(path.join(root, "src")).map((file) => ({ file: path.relative(root, file), text: withoutComments(readFileSync(file, "utf8")) }));

// Where each term is shown: <InfoDot term="..." />, or info="..." on a
// PageTitle or Field, which draw the same (i).
const shownIn = new Map<string, string[]>();
for (const { file, text } of sources) {
  for (const match of text.matchAll(/\b(?:term|info)="([a-z-]+)"/g)) {
    shownIn.set(match[1], [...(shownIn.get(match[1]) ?? []), file]);
  }
}

// A route is real if there is a page.tsx for it under any route group.
function routeExists(route: string): boolean {
  const segments = route.replace(/^\//, "");
  return ["src/app", "src/app/(app)", "src/app/(auth)"].some((base) => existsSync(path.join(root, base, segments, "page.tsx")));
}

const neverShown = entries.filter(([term]) => !shownIn.has(term)).map(([term]) => term);
assert(neverShown.length === 0, `every term has an (i) on some page${neverShown.length ? `; never shown: ${neverShown.join(", ")}` : ` (${entries.length} terms)`}`);

const unknown = [...shownIn.keys()].filter((term) => !Object.hasOwn(GLOSSARY, term));
assert(unknown.length === 0, `every (i) on a page names a term the glossary defines${unknown.length ? `; unknown: ${unknown.join(", ")}` : ""}`);

const brokenLinks = entries.filter(([, entry]) => entry.see && !routeExists(entry.see.href)).map(([term, entry]) => `${term} -> ${entry.see!.href}`);
assert(brokenLinks.length === 0, `every "See ..." link goes to a real page${brokenLinks.length ? `; broken: ${brokenLinks.join(", ")}` : ""}`);

const unlinked = entries.filter(([, entry]) => !entry.see).map(([term]) => term);
assert(unlinked.length === 0, `every term links to the page where you can see it for yourself${unlinked.length ? `; no link: ${unlinked.join(", ")}` : ""}`);

// "See your ledger ›" is built from the link label, so the label continues
// the sentence: lowercase first letter, no full stop.
const badLinkLabels = entries.filter(([, entry]) => entry.see && !/^[a-z].*[^.]$/.test(entry.see.label)).map(([term]) => term);
assert(badLinkLabels.length === 0, `every link label reads after "See ..."${badLinkLabels.length ? `; not: ${badLinkLabels.join(", ")}` : ""}`);

// Plain sentences: capital first, full stop last.
const sentence = (text: string) => /^[A-Z]/.test(text) && /[.!?]$/.test(text);
const unfinished = entries.filter(([, entry]) => !sentence(entry.short) || !sentence(entry.more)).map(([term]) => term);
assert(unfinished.length === 0, `every short and longer explanation starts with a capital and ends with a full stop${unfinished.length ? `; not: ${unfinished.join(", ")}` : ""}`);

// The first view has to fit a phone without scrolling; the rest is folded away.
const SHORT_LIMIT = 220;
const long = entries.filter(([, entry]) => entry.short.length > SHORT_LIMIT || entry.short.length >= entry.more.length).map(([term, entry]) => `${term} (${entry.short.length})`);
assert(long.length === 0, `every short explanation is under ${SHORT_LIMIT} characters and shorter than the fuller one${long.length ? `; too long: ${long.join(", ")}` : ""}`);

// The code calls some things by other names; people never see those.
const CODE_NAMES = /\b(covenants?|keepers?|circles?|jubilee|accusation credit|cents?|minutes? stored|ObjectId|standing\.\w+)\b/i;
const leaks = entries.filter(([, entry]) => CODE_NAMES.test(`${entry.label} ${entry.short} ${entry.more}`)).map(([term, entry]) => `${term}: "${CODE_NAMES.exec(`${entry.label} ${entry.short} ${entry.more}`)![0]}"`);
assert(leaks.length === 0, `no code names in what people read${leaks.length ? `; found ${leaks.join(", ")}` : ""}`);

// The numbers in the explanations are typed as words and figures, so they are
// checked against the constants the code actually uses. Change a rule and this
// fails until its explanation says the same thing. A number with no word here
// fails too, so a new value cannot slip through unspelled.
const WORDS: Record<number, string> = { 2: "two", 3: "three", 5: "five", 60: "sixty", 90: "ninety" };
const TIMES: Record<number, string> = { 2: "twice", 3: "three times" };
const spelled = (n: number) => WORDS[n] ?? `(no word for ${n}: add it to WORDS)`;
const capitalized = (text: string) => text[0].toUpperCase() + text.slice(1);
const { circles, requiredVouches, tiers } = STANDING_RULES;
const said: [Term, string, string][] = [
  ["demurrage", "the demurrage rate and how often it runs", `Every ${DEMURRAGE_INTERVAL_DAYS} days, ${Math.round(DEMURRAGE_RATE_MONTHLY * 100)}% of each positive Grace balance`],
  ["accusation-credit", "the dispute allowance", `You start with ${circles.base} open disputes at a time, plus one for every ${circles.pointsPerExtra} points of standing`],
  ["verified", "how many vouches verification needs", `divided by ${spelled(requiredVouches.divisor)}, at least ${requiredVouches.atLeast} and never more than ${requiredVouches.atMost}`],
  ["mediator", "the size of the mediator pool", `about ${spelled(keeperPoolSize(100))} per hundred residents`],
  ["dispute", "the number of mediators on a dispute", `${capitalized(spelled(KEEPERS_PER_CIRCLE))} mediators`],
  ["commons", "how long before a quiet steward can be replaced", `${spelled(STEWARD_SILENT_DAYS)} days`],
  ["steward", "how long before a quiet steward can be replaced", `${spelled(STEWARD_SILENT_DAYS)} days`],
  ["usual-price", "how far back usual prices look", `last ${spelled(REFERENCE_WINDOW_DAYS)} days`],
  ["usual-price", "how many sales a usual price needs", `${spelled(REFERENCE_MINIMUM_EXCHANGES)} such sales`],
  ["usual-price", "when a high ask gets a note", `more than ${TIMES[HIGH_ASK_FACTOR] ?? `(no word for ${HIGH_ASK_FACTOR} times)`} the usual price`],
  ["standing", "the names of the standing tiers", `newcomer, ${Object.keys(tiers).reverse().slice(0, -1).join(", ")} or ${Object.keys(tiers)[0]}`],
];
for (const [term, what, phrase] of said) {
  const entry = GLOSSARY[term];
  assert(`${entry.short} ${entry.more}`.includes(phrase), `${entry.label} states ${what} as the code does: "${phrase}"`);
}

const labels = entries.map(([, entry]) => entry.label.toLowerCase());
assert(new Set(labels).size === labels.length, "no two terms share a label");

// An (i) is a button, and a <label> hands its clicks to the first control
// inside it, so an (i) inside a label would steal the input's clicks and name.
// Field takes `info` for this; nothing should put an InfoDot inside a <Field>
// (whose children sit inside its label) or inside a <label> directly.
const dotInsideLabel = (text: string) => /<(Field|label)\b[^>]*>(?:(?!<\/\1>)[\s\S])*<InfoDot/.test(text);
assert(dotInsideLabel(`<Field label="Grace">\n  <InfoDot term="grace" />\n  <Input name="x" />\n</Field>`) && dotInsideLabel(`<label className="flex"><input /> Settle <InfoDot term="grace" /></label>`), "the label check catches an (i) put inside a Field or a label");
assert(!dotInsideLabel(`<Field label="Locality" info="locality"><Input /></Field>\n<p>Grace <InfoDot term="grace" /></p>`), "the label check lets an (i) beside a field through");
const insideLabel = sources.filter(({ text }) => dotInsideLabel(text)).map(({ file }) => file);
assert(insideLabel.length === 0, `no (i) is put inside a form label${insideLabel.length ? `; found in ${insideLabel.join(", ")}` : ""}`);

console.log(`\n${entries.length} terms; shown in ${new Set([...shownIn.values()].flat()).size} files.`);
