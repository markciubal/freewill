// When Grace moved from whole units to hundredths, and whether a database can
// safely be scaled by 100 to match. Pure, so smoke:prod can check the rule.
//
// Code from commit 49c8432 (2026-09-20 16:10 UTC) on writes hundredths. A
// database that recorded any Grace after that was already being written in
// hundredths, and scaling it again would multiply real balances by 100: a
// community holding 20 Grace would appear to hold 2,000. That is a false
// picture as surely as seeded data, so the migration refuses and says why.
// Refusing is the safe mistake: a database that truly needs scaling but has a
// few later records is a case for a person, not for the script.

export const GRACE_IN_HUNDREDTHS_SINCE = new Date("2026-09-20T16:10:45Z");

export type GraceRecordsSinceChange = {
  transfers: number;
  adjustments: number;
  vouchers: number;
  cashNotes: number;
  listingsWithGraceAsk: number;
  demurrageRunsThatMelted: number;
};

const LABEL: Record<keyof GraceRecordsSinceChange, string> = {
  transfers: "Grace transfers",
  adjustments: "Grace adjustments",
  vouchers: "Grace vouchers",
  cashNotes: "cash notes",
  listingsWithGraceAsk: "listings asking Grace",
  demurrageRunsThatMelted: "demurrage runs",
};

// Null when scaling is safe (nothing was written in hundredths yet), otherwise
// the reason, in words, to print before refusing.
export function whyNotScale(since: GraceRecordsSinceChange): string | null {
  const found = (Object.keys(LABEL) as (keyof GraceRecordsSinceChange)[]).filter((kind) => since[kind] > 0);
  if (found.length === 0) return null;
  const list = found.map((kind) => `${since[kind]} ${LABEL[kind]}`).join(", ");
  return `this database recorded Grace after ${GRACE_IN_HUNDREDTHS_SINCE.toISOString().slice(0, 10)}, when the app began writing hundredths (${list}), so it already holds hundredths and scaling again would multiply real balances by 100`;
}
