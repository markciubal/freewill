import type { Category } from "@prisma/client";
import { SURVIVAL } from "./covenant";

// The water-diamond problem, handled without a price-setter.
//
// In ordinary times water is cheap because it is plentiful, and that is fine.
// In a collapse it is not plentiful, and a market left alone hands the last
// jug to whoever can pay the most. This app has no authority that could cap a
// price, and a cap would only push scarce goods off the board into places with
// no record at all. What it can do is take away the thing gouging depends on:
// the buyer not knowing what is normal. So it shows what a category has
// actually settled for nearby, says so plainly when an offer of a survival
// good asks far more than that, and makes a gift or Hours the starting choice
// for survival and care listings. Signals and defaults; never a block.
//
// This file is pure: numbers in, numbers out. The database half is in
// pricing.data.ts.

// How far back "recent" reaches, and how many settled exchanges there must be
// before a usual price is shown at all. The floor of three is a privacy rule
// as much as a statistical one: a median of one or two exchanges is just those
// people's prices.
export const REFERENCE_WINDOW_DAYS = 90;
export const REFERENCE_MINIMUM_EXCHANGES = 3;

// An offer of a survival good asking more than this many times the usual
// price gets a plain public note.
export const HIGH_ASK_FACTOR = 2;

export type Reference = { median: number; exchanges: number };

// The middle value; the mean of the middle two when the count is even. The
// median is used rather than the average so that one desperate or one
// exploitative exchange cannot move the figure everyone else sees.
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

// The usual price from a list of settled amounts, or null when there are too
// few to show.
export function referenceFrom(settledAmounts: number[]): Reference | null {
  if (settledAmounts.length < REFERENCE_MINIMUM_EXCHANGES) return null;
  return { median: median(settledAmounts)!, exchanges: settledAmounts.length };
}

export type AskSignal = { timesUsual: number; usual: number; exchanges: number };

// Does this ask earn a note? Only an OFFER (someone selling) of a survival
// good, asking more than HIGH_ASK_FACTOR times what the category has recently
// settled for nearby. A high price on a NEED is the person in need offering to
// pay more, which is desperation, not gouging, and gets no note.
export function askSignal(listing: { kind: "OFFER" | "NEED"; category: Category; ask: number | null }, reference: Reference | null): AskSignal | null {
  if (listing.kind !== "OFFER" || !listing.ask || !reference || reference.median <= 0) return null;
  if (!SURVIVAL.includes(listing.category)) return null;
  const timesUsual = listing.ask / reference.median;
  if (timesUsual <= HIGH_ASK_FACTOR) return null;
  return { timesUsual, usual: reference.median, exchanges: reference.exchanges };
}

// "about 3 times", "about 2.5 times": one decimal below five, whole numbers above.
export function fmtTimes(times: number): string {
  return times >= 5 ? `${Math.round(times)}` : `${Math.round(times * 2) / 2}`;
}

// How a new listing starts out. A default is the gentlest lever there is: it
// decides nothing, and every other way to settle is one click away.
//   Survival goods start as a gift, because the ground rules say the
//   vulnerable come first when things are short.
//   Care, skills and knowledge start in Hours, where everyone's time is equal.
//   Everything else starts in Grace.
export type Settlement = "gift" | "hours" | "grace" | "barter" | "mix";

export function defaultSettlementFor(category: Category): Settlement {
  if (SURVIVAL.includes(category)) return "gift";
  if (category === "CARE" || category === "SKILLS" || category === "KNOWLEDGE") return "hours";
  return "grace";
}

export const SETTLEMENT_LABEL: Record<Settlement, string> = {
  gift: "Gift",
  hours: "Hours",
  grace: "Grace",
  barter: "Barter",
  mix: "A mix",
};

export const SETTLEMENT_HINT: Record<Settlement, string> = {
  gift: "Nothing asked in return.",
  hours: "Time for time. Everyone's hour is worth the same.",
  grace: "A price in Grace.",
  barter: "Say what you would take in return.",
  mix: "Any combination of barter, Grace and Hours.",
};

// ---------------------------------------------------------------------------
// The trade pulse, by category. Answers are private individually and public
// only as sums, so a category appears only once enough people have answered
// that no single answer can be read back out of the average.
// ---------------------------------------------------------------------------

export const PULSE_MINIMUM_ANSWERS = 3;

export type CategoryPulse = { category: Category; answers: number; average: number; usualGrace: Reference | null };

export function categoryPulseFrom(category: Category, deltas: number[], usualGrace: Reference | null): CategoryPulse | null {
  if (deltas.length < PULSE_MINIMUM_ANSWERS) return null;
  const sum = deltas.reduce((total, delta) => total + delta, 0);
  return { category, answers: deltas.length, average: sum / deltas.length, usualGrace };
}
