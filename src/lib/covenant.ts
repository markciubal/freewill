import type { Category } from "@prisma/client";

// ---------------------------------------------------------------------------
// The Covenant. Morality is the only law; this is the shortest statement of it
// that everyone affirms on joining. It is not enforced by anyone. It is the
// standard people hold each other to in circles, and the reason vouches mean
// something.
// ---------------------------------------------------------------------------

export const COVENANT = [
  {
    title: "Do no harm",
    text: "I will not take life, liberty, body, or livelihood from another. Where I have caused harm, I will make it right.",
  },
  {
    title: "Keep my word",
    text: "A pledge made here is a debt of honor. I will keep it, or say plainly and early that I cannot.",
  },
  {
    title: "Take what I need, give what I can",
    text: "The commons belongs to everyone and to no one. I will leave it better than I found it.",
  },
  {
    title: "Speak truly",
    text: "I will not deceive, and I will not stay silent when silence deceives.",
  },
  {
    title: "Protect the vulnerable",
    text: "Children, the old, the sick, and the stranger have first claim on our shared strength.",
  },
  {
    title: "Judge slowly, repair quickly",
    text: "When wronged I will seek a circle before I seek revenge. Restitution over punishment. No cages.",
  },
  {
    title: "No masters",
    text: "No person or group rules another here. Standing is earned by service and can never be seized.",
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
