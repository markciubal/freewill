// The audit's own questions must be well formed before they are worth asking:
// every claim in the manifest covered, every question shaped the way the
// TypeSafe API requires, and every question with a defined reading, because a
// question nobody knows how to read is a question that quietly always passes.
// Run: npm run smoke:audit
import {
  ACCEPTABLE_CHOICE,
  CONFIDENCE,
  MINIMUM_SCORE,
  NOUL_YES_IS_TROUBLING,
  SCORE_LEVEL_LIMIT,
  buildClaimAudits,
  hasReading,
  noulVerdict,
  readAnswer,
  verdictFor,
  type Answer,
} from "../src/lib/audit.questions";
import { MANIFEST } from "../src/lib/manifest";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

const audits = buildClaimAudits();
const allQuestions = audits.flatMap((audit) => Object.entries(audit.questions));

// Coverage: nothing in the manifest may go unaudited.
const audited = new Set(audits.map((audit) => audit.id));
const missing = [
  ...MANIFEST.principles.filter((principle) => !audited.has(`principle:${principle.key}`)).map((principle) => principle.key),
  ...MANIFEST.capabilities.filter((capability) => !audited.has(`capability:${capability.key}`)).map((capability) => capability.key),
  ...MANIFEST.questions.filter((question) => !audited.has(`answer:${question.key}`)).map((question) => question.key),
];
assert(missing.length === 0, `every claim in the manifest is audited: ${MANIFEST.principles.length} principles, ${MANIFEST.capabilities.length} capabilities, ${MANIFEST.questions.length} answers, plus the provenance and the whole${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
assert(audits.length === MANIFEST.principles.length + MANIFEST.capabilities.length + MANIFEST.questions.length + 2, `${audits.length} claims audited by ${allQuestions.length} questions`);

// Shape: what the API accepts.
const badChoice = allQuestions.filter(([, spec]) => spec.type === "choice" && Object.keys(spec.criteria).length < 2);
assert(badChoice.length === 0, "every choice question offers at least two options");
const badScore = allQuestions.filter(([, spec]) => spec.type === "score" && (spec.criteria.length < 2 || spec.criteria.length > SCORE_LEVEL_LIMIT));
assert(badScore.length === 0, `every score question has between 2 and ${SCORE_LEVEL_LIMIT} ordered levels`);
assert(allQuestions.every(([, spec]) => spec.instructions.trim().length > 15), "every question actually asks something");
const noulsWithCriteria = allQuestions.filter(([, spec]) => spec.type === "noul" && spec.criteria);
assert(noulsWithCriteria.length === allQuestions.filter(([, spec]) => spec.type === "noul").length, "every yes/no question says what yes and no each mean, so the answer space is fixed rather than guessed");

// Readings: the check that matters most.
const unreadable = allQuestions.filter(([key]) => !hasReading(key)).map(([key]) => key);
assert(unreadable.length === 0, `every question has a defined reading${unreadable.length ? `; undefined: ${[...new Set(unreadable)].join(", ")}` : ""}`);
const acceptableExists = Object.entries(ACCEPTABLE_CHOICE).every(([key, acceptable]) =>
  allQuestions.some(([questionKey, spec]) => questionKey === key && spec.type === "choice" && acceptable in spec.criteria),
);
assert(acceptableExists, "every acceptable answer named in a reading is actually one of that question's options");
const scoresInRange = Object.entries(MINIMUM_SCORE).every(([key, minimum]) =>
  allQuestions.some(([questionKey, spec]) => questionKey === key && spec.type === "score" && minimum > 0 && minimum < spec.criteria.length - 1),
);
assert(scoresInRange, "every score threshold sits inside its own rubric, so it can be both met and missed");

// A question whose reading has no failing answer would always pass. For each
// choice question, at least one option must be unacceptable.
const alwaysPasses = allQuestions.filter(([key, spec]) => spec.type === "choice" && Object.keys(spec.criteria).every((option) => option === ACCEPTABLE_CHOICE[key]));
assert(alwaysPasses.length === 0, "no question is written so that every possible answer passes");

// Verdicts: the thresholds from the documentation, applied.
assert(verdictFor({ troubling: false, confidence: 0.95 }) === "clean", "a confident, untroubling answer is clean");
assert(verdictFor({ troubling: true, confidence: 0.95 }) === "finding", "a confident, troubling answer is a finding");
assert(verdictFor({ troubling: true, confidence: 0.7 }) === "needs-a-person", "a troubling answer the model is unsure of goes to a person, not into the report as fact");
assert(verdictFor({ troubling: false, confidence: 0.3 }) === "needs-a-person", `below ${CONFIDENCE.review} confidence nothing is acted on, even a clean answer`);
assert(noulVerdict(0.99, true) === "finding" && noulVerdict(0.01, true) === "clean", "a near-certain yes to a troubling question is a finding; a near-certain no is clean");
assert(noulVerdict(0.5, true) === "needs-a-person" && noulVerdict(0.55, true) === "needs-a-person", "a yes/no answer near even odds goes to a person");
assert(noulVerdict(0.02, false) === "finding", "for a question where no is the bad answer, a near-certain no is the finding");

// Reading real answer shapes.
const clean = readAnswer("limits_honest", { type: "choice", choice: "candid", confidence: 0.95, probabilities: { candid: 0.95, partial: 0.04, marketing: 0.01 } } satisfies Answer);
assert(clean.verdict === "clean" && clean.reading.includes("candid"), `a candid disclosure reads clean: "${clean.reading}"`);
const marketing = readAnswer("limits_honest", { type: "choice", choice: "marketing", confidence: 0.93, probabilities: { candid: 0.03, partial: 0.04, marketing: 0.93 } } satisfies Answer);
assert(marketing.verdict === "finding", `a disclosure judged as marketing is a finding: "${marketing.reading}"`);
const weak = readAnswer("overall_honesty", { type: "score", score: 1.4, confidence: 0.91 } satisfies Answer);
assert(weak.verdict === "finding" && weak.reading.includes("needs 3"), `a low candour score is a finding against its stated threshold: "${weak.reading}"`);
const unsure = readAnswer("overall_honesty", { type: "score", score: 1.4, confidence: 0.4 } satisfies Answer);
assert(unsure.verdict === "needs-a-person", "the same low score, unconfidently given, goes to a person instead");
const unknown = readAnswer("a_question_nobody_defined", { type: "noul", noul: 0.99 } satisfies Answer);
assert(unknown.verdict === "needs-a-person" && unknown.reading.includes("no reading defined"), "an answer to a question with no reading is never silently clean");

// The questions must be able to find fault, including with themselves.
const audit = audits.find((entry) => entry.id === "provenance")!;
assert(Object.keys(audit.questions).some((key) => NOUL_YES_IS_TROUBLING[key] === false), "the provenance is audited for disclosures that must be present, not only for ones that must be absent");
assert(audits.some((entry) => Object.keys(entry.questions).includes("omits_material_limit")), "capabilities are audited for the limitation that is missing, which is what a schema cannot catch");
assert(audits.every((entry) => entry.evidenceFrom.length > 0 || entry.id === "provenance" || entry.id === "manifest"), "every claim audited against evidence names where that evidence comes from");

// The state sent for each claim carries the claim itself, so the model is
// judging the text rather than recalling something about the project.
assert(audits.every((entry) => Object.keys(entry.state).length >= 2), "every claim is sent with its own text as state");
