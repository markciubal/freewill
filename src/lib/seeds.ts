import type { SeedCategory, SeedForm, SeedRequestStatus } from "@prisma/client";

// The seed bank & plant exchange. Pure labels and seasonal logic live here so
// they can be tested and shared between server and client without a database.

export const SEED_FORM_LABEL: Record<SeedForm, string> = {
  SEED: "Seed",
  SEEDLING: "Seedling",
  CUTTING: "Cutting",
  TUBER: "Tuber",
  BULB: "Bulb",
  SCION: "Scion / graft wood",
};

export const SEED_CATEGORY_LABEL: Record<SeedCategory, string> = {
  VEGETABLE: "Vegetable",
  HERB: "Herb",
  FRUIT: "Fruit",
  GRAIN: "Grain",
  FLOWER: "Flower",
  TREE: "Tree & shrub",
  COVER_CROP: "Cover crop",
  OTHER: "Other",
};

export const SEED_REQUEST_LABEL: Record<SeedRequestStatus, string> = {
  REQUESTED: "Requested",
  GIVEN: "Growing",
  RETURNED: "Returned to the bank",
  DECLINED: "Declined",
};

export const SEED_FORMS = Object.keys(SEED_FORM_LABEL) as SeedForm[];
export const SEED_CATEGORIES = Object.keys(SEED_CATEGORY_LABEL) as SeedCategory[];

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Parse a "sow months" input: numbers 1-12 or month names/abbreviations,
// separated by commas, ranges like "3-6" allowed. Deduped, sorted.
export function parseSowMonths(input: string | undefined | null): number[] {
  if (!input) return [];
  const out = new Set<number>();
  const resolve = (t: string): number | null => {
    const s = t.trim();
    if (!s) return null;
    const n = Number(s);
    if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
    const i = MONTHS.findIndex((m) => s.toLowerCase().startsWith(m.toLowerCase()));
    return i >= 0 ? i + 1 : null;
  };
  for (const tokenRaw of input.split(",")) {
    const token = tokenRaw.trim();
    if (!token) continue;
    const range = token.match(/^(.+?)\s*-\s*(.+)$/);
    if (range) {
      const a = resolve(range[1]);
      const b = resolve(range[2]);
      if (a && b) {
        // wrap around the year end if a > b (e.g. Nov-Feb)
        for (let m = a; ; m = (m % 12) + 1) {
          out.add(m);
          if (m === b) break;
        }
      }
      continue;
    }
    const single = resolve(token);
    if (single) out.add(single);
  }
  return [...out].sort((x, y) => x - y);
}

export function formatSowMonths(months: number[]): string {
  if (!months.length) return "any time";
  return months
    .slice()
    .sort((a, b) => a - b)
    .map((m) => MONTHS[m - 1])
    .join(", ");
}

// Is this variety sowable in the given month (1-12)? Empty list = any time.
export function sowableIn(sowMonths: number[], month: number): boolean {
  return sowMonths.length === 0 || sowMonths.includes(month);
}

export function currentMonth(): number {
  return new Date().getMonth() + 1;
}
