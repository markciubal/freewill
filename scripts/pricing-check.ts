// Reference prices, the high-ask note, settlement defaults, and the pulse by
// category: the app's answer to pricing survival goods when they are scarce,
// with no price-setter. Pure rules first, then a read-only look at live data.
// Run: npm run smoke:pricing
import "./not-production";
import type { Category } from "@prisma/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HighAskNote, PulseByCategory } from "../src/components/pricing-views";
import { CATEGORIES, SURVIVAL } from "../src/lib/covenant";
import { db } from "../src/lib/db";
import {
  HIGH_ASK_FACTOR,
  PULSE_MINIMUM_ANSWERS,
  REFERENCE_MINIMUM_EXCHANGES,
  SETTLEMENT_HINT,
  SETTLEMENT_LABEL,
  askSignal,
  categoryPulseFrom,
  defaultSettlementFor,
  fmtTimes,
  median,
  referenceFrom,
} from "../src/lib/pricing";
import { getPulseByCategory, getReferencePrices } from "../src/lib/pricing.data";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

async function main() {
  // The median, and why it is the median.
  assert(median([]) === null && median([500]) === 500, "no exchanges means no figure; one exchange is its own middle");
  assert(median([300, 100, 200]) === 200 && median([100, 200, 300, 400]) === 250, "the middle value, or the mean of the middle two");
  const honest = [400, 400, 450, 500];
  const withOneGouge = [...honest, 40_000];
  const meanWithGouge = withOneGouge.reduce((a, b) => a + b, 0) / withOneGouge.length;
  assert(median(withOneGouge) === 450 && meanWithGouge > 8000, `one exploitative sale cannot move the usual price: the median stays ${median(withOneGouge)} while an average would have jumped to ${Math.round(meanWithGouge)}`);

  // The floor: too few exchanges shows nothing, which protects the people in them.
  assert(referenceFrom([400, 500]) === null, `fewer than ${REFERENCE_MINIMUM_EXCHANGES} settled exchanges shows no usual price (it would just be those people's prices)`);
  const reference = referenceFrom([400, 500, 600]);
  assert(reference?.median === 500 && reference.exchanges === 3, "three exchanges is enough, and the figure says how many it came from");

  // The note: only where a high price is gouging, never where it is desperation.
  const water = (kind: "OFFER" | "NEED", ask: number | null, category: Category = "WATER") => askSignal({ kind, category, ask }, reference);
  assert(water("OFFER", 1500)?.timesUsual === 3, "an offer of water at three times the usual earns a note");
  assert(water("OFFER", 1000) === null, `an ask at exactly ${HIGH_ASK_FACTOR} times the usual does not; the note is for well above, not above`);
  assert(water("OFFER", 600) === null, "a somewhat high ask earns nothing: prices may differ for good reasons");
  assert(water("NEED", 5000) === null, "a person in need offering to pay ten times the usual is desperate, not gouging, and is never flagged");
  assert(water("OFFER", 5000, "TOOLS") === null, "only survival goods carry the note; a dear wrench is nobody's emergency");
  assert(water("OFFER", null) === null, "a gift can never be flagged");
  assert(askSignal({ kind: "OFFER", category: "WATER", ask: 99_999 }, null) === null, "with no usual price known, nothing is flagged: no data, no accusation");
  assert(SURVIVAL.every((category) => water("OFFER", 5000, category) !== null), `every survival category is covered: ${SURVIVAL.join(", ")}`);
  assert(fmtTimes(3) === "3" && fmtTimes(2.6) === "2.5" && fmtTimes(7.4) === "7", "the multiple is said roughly, because it is rough");

  // Defaults: where a listing starts, never where it must stay.
  assert(SURVIVAL.every((category) => defaultSettlementFor(category) === "gift"), "survival goods start as a gift");
  assert((["CARE", "SKILLS", "KNOWLEDGE"] as Category[]).every((category) => defaultSettlementFor(category) === "hours"), "care, skills and knowledge start in Hours, where everyone's time is equal");
  assert((["TOOLS", "TRANSPORT", "ENERGY", "OTHER"] as Category[]).every((category) => defaultSettlementFor(category) === "grace"), "everything else starts in Grace");
  assert(CATEGORIES.every((category) => defaultSettlementFor(category) in SETTLEMENT_LABEL), "every category has a starting point");
  assert(Object.keys(SETTLEMENT_LABEL).length === 5 && Object.keys(SETTLEMENT_HINT).length === 5, "five ways to settle, each explained: gift, Hours, Grace, barter, a mix");

  // The pulse by category: answers are private, so a small category is not shown.
  assert(categoryPulseFrom("WATER", [2, 2], null) === null, `a category with fewer than ${PULSE_MINIMUM_ANSWERS} answers is not shown, so no one's answer can be read from an average`);
  const waterPulse = categoryPulseFrom("WATER", [2, 2, 1], reference);
  assert(waterPulse?.answers === 3 && Math.abs(waterPulse.average - 5 / 3) < 1e-9 && waterPulse.usualGrace?.median === 500, "with enough answers: the average, the count, and what the category usually settles for");
  const toolsPulse = categoryPulseFrom("TOOLS", [0, 1, 0], referenceFrom([5000, 6000, 7000]));
  assert(!!waterPulse && !!toolsPulse && waterPulse.average > toolsPulse.average && waterPulse.usualGrace!.median < toolsPulse.usualGrace!.median, "the paradox, in numbers: water helped more and cost less than tools");

  // What a member actually sees, rendered with made-up numbers and no database.
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");
  const note = text(renderToStaticMarkup(createElement(HighAskNote, { signal: water("OFFER", 1500)!, category: "WATER" })));
  assert(note.includes("about 3 times") && note.includes("water") && note.includes("5") && note.includes("3 exchanges"), "the note says how many times the usual, what the usual is, and how many exchanges that rests on");
  assert(note.includes("good reasons") && note.includes("Ask before you decide"), "the note offers the innocent explanations first and tells the reader to ask, not to accuse");
  assert(note.includes("Nobody sets prices here"), "the note says plainly that nobody set the price it is compared against");
  assert(!/gouging|greedy|unfair|report/i.test(note), "the note never accuses: no 'gouging', no 'unfair', nothing to report to");

  const table = text(renderToStaticMarkup(createElement(PulseByCategory, { rows: [waterPulse!, toolsPulse!] })));
  assert(table.includes("Water") && table.includes("survival") && table.includes("+1.7") && table.includes("from 3"), "the pulse table shows the category, that it is a survival good, the average, and how many answered");
  assert(table.includes("Tools") && table.indexOf("Water") < table.indexOf("Tools"), "rows keep the order given: most helped first");
  assert(table.includes("5") && table.includes("60"), "Grace is shown in whole units (5 and 60), not in stored cents (500 and 6000)");
  assert(table.includes("nobody's own answer can be read from it"), "the table says why small categories are missing");
  assert(renderToStaticMarkup(createElement(PulseByCategory, { rows: [] })) === "", "with nothing to show, nothing is rendered");
  const giftOnly = text(renderToStaticMarkup(createElement(PulseByCategory, { rows: [categoryPulseFrom("CARE", [2, 2, 2], null)!] })));
  assert(giftOnly.includes("gift, Hours or barter"), "a category that settles without Grace says so instead of showing a blank price");

  // Live, read-only.
  try {
    const someone = await db.user.findFirst({ select: { id: true, locality: true, lat: true, lng: true } });
    if (someone) {
      const references = await getReferencePrices(someone);
      assert(CATEGORIES.every((category) => category in references), "a usual price (or its absence) is answered for every category");
      const shown = Object.values(references).flatMap((entry) => [entry.grace, entry.hours]).filter((entry) => entry !== null);
      assert(shown.every((entry) => entry.exchanges >= REFERENCE_MINIMUM_EXCHANGES && entry.median > 0), `every usual price shown from live data rests on at least ${REFERENCE_MINIMUM_EXCHANGES} real exchanges (${shown.length} shown)`);
    }
    const pulse = await getPulseByCategory();
    assert(pulse.every((row) => row.answers >= PULSE_MINIMUM_ANSWERS && row.average >= -2 && row.average <= 2), `the live pulse shows only categories with at least ${PULSE_MINIMUM_ANSWERS} answers (${pulse.length} shown)`);
    assert(pulse.every((row, index) => index === 0 || pulse[index - 1].average >= row.average), "the pulse lists where trade helped most first");
    await db.$disconnect();
  } catch (error) {
    console.log("(dev DB not reachable; skipped live checks)", (error as Error).message.split("\n")[0]);
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
