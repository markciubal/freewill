import type { Category } from "@prisma/client";

// ---------------------------------------------------------------------------
// The ground rules (code name: covenant). The shortest statement of how people
// here treat each other, agreed to at signup. Nobody enforces them; they are
// the standard disputes refer to and the reason a vouch means something.
// Keep the tone plain and civic, never vow-like.
// ---------------------------------------------------------------------------

export const COVENANT = [
  {
    title: "Do no harm",
    text: "Do not take or damage another person's life, safety, or livelihood. If you cause harm, help make it right.",
  },
  {
    title: "Keep your word",
    text: "If you promise something here, follow through, or say early and plainly that you cannot.",
  },
  {
    title: "Give and take fairly",
    text: "Shared resources belong to everyone. Take what you need, contribute what you can, and leave things better than you found them.",
  },
  {
    title: "Be honest",
    text: "Do not mislead people, and speak up when staying quiet would mislead them.",
  },
  {
    title: "Look out for the vulnerable",
    text: "When resources are short, children, elders, the sick, and newcomers come first.",
  },
  {
    title: "Settle conflict by repair",
    text: "If you are wronged, open a dispute instead of retaliating. The goal is fixing the harm, not punishing the person.",
  },
  {
    title: "Nobody is in charge",
    text: "There are no admins or officials. Reliability earns standing, and standing only affects how much credit you can use.",
  },
] as const;

// ---------------------------------------------------------------------------
// Categories of need and offer. Survival categories are surfaced first
// everywhere in the app.
// ---------------------------------------------------------------------------

export const CATEGORY_LABEL: Record<Category, string> = {
  WATER: "Water",
  FOOD: "Food",
  MEDICAL: "Medical",
  SHELTER: "Shelter",
  SAFETY: "Safety",
  ENERGY: "Energy & fuel",
  TOOLS: "Tools & parts",
  TRANSPORT: "Transport",
  SKILLS: "Skills & labor",
  CARE: "Care",
  KNOWLEDGE: "Knowledge",
  OTHER: "Other",
};

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
export const SURVIVAL: Category[] = ["WATER", "FOOD", "MEDICAL", "SHELTER", "SAFETY"];

// ---------------------------------------------------------------------------
// The Program Catalog. What a stateless society needs, in the order it needs
// it. Tier 0 keeps people alive and talking. Tier 1 lets them exchange and
// repair. Tier 2 lets them flourish. Each program is a feature area of this
// app, live or planned.
// ---------------------------------------------------------------------------

export type Tier = 0 | 1 | 2;

export const TIERS: Record<Tier, { name: string; horizon: string; goal: string }> = {
  0: { name: "Survive", horizon: "Days to weeks", goal: "Keep people alive, informed, and able to find each other." },
  1: { name: "Stabilize", horizon: "Weeks to months", goal: "Let people exchange, share, and repair harm without a state." },
  2: { name: "Flourish", horizon: "Months onward", goal: "Make the arrangement durable, teachable, and resistant to capture." },
};

export type Program = {
  key: string;
  name: string;
  tier: Tier;
  status: "live" | "planned";
  route?: string;
  summary: string;
  why: string;
  features: string[];
};
