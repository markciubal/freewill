import { z } from "zod";

// The shape of the app's self-description. The point of putting it in a schema
// rather than in prose is that the schema is a promise about the *shape* of
// every claim: a capability cannot be declared without saying what it does not
// do, where the idea came from, and how a reader can check it. A claim missing
// its limits will not parse, so it cannot ship.
//
// The manifest itself is in manifest.ts. The smoke test (npm run smoke:about)
// parses it with this schema and then checks the things a schema cannot: that
// every route exists as a page, every `verifiedBy` names a real script or
// page, and every live-state key resolves to a real function.

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);

// Where an idea came from. Anything the design borrowed is named: a book, a
// protocol, a body of practice. `url` is optional because some sources are
// books, and a person with no internet can still look them up.
export const SourceSchema = z.object({
  title: nonEmpty(160),
  author: nonEmpty(120).optional(),
  year: z.number().int().min(1500).max(2100).optional(),
  url: z.string().url().max(300).optional(),
  // What this source actually contributed. Not a bibliography entry: a reason.
  informs: nonEmpty(400),
});
export type Source = z.infer<typeof SourceSchema>;

// How a reader checks a claim for themselves. Either a smoke script they can
// run, a page in the app that shows the live state, or a file they can read.
export const CheckSchema = z.object({
  kind: z.enum(["script", "page", "file"]),
  // "smoke:explain", "/explain", or "src/lib/ledger.ts"
  ref: nonEmpty(120),
  what: nonEmpty(300),
});
export type Check = z.infer<typeof CheckSchema>;

// A thing the software does. Every one carries its own limits.
export const CapabilitySchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/, "capability keys are lowercase words joined by hyphens"),
  name: nonEmpty(80),
  status: z.enum(["live", "partial", "planned"]),
  // Where a member uses it, when it has a page.
  route: z
    .string()
    .regex(/^\/[a-z0-9/-]*$/, "routes start with a slash")
    .max(60)
    .optional(),
  does: nonEmpty(600),
  // The requirement that gives this schema its teeth: no capability without
  // at least one honest limitation, in the app's own voice, plainly stated.
  doesNot: z.array(nonEmpty(400)).min(1, "every capability must state at least one thing it does not do"),
  // How a reader checks the claim. At least one.
  verifiedBy: z.array(CheckSchema).min(1, "every capability must say how to check it"),
  sources: z.array(SourceSchema).default([]),
});
export type Capability = z.infer<typeof CapabilitySchema>;

// A principle is a rule the software holds itself to, paired with what would
// count as breaking it. A principle nobody could falsify is decoration.
export const PrincipleSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/),
  statement: nonEmpty(300),
  because: nonEmpty(600),
  // What would show this principle had been abandoned. Written so that a
  // reader could go and look.
  brokenIf: nonEmpty(400),
  enforcedBy: z.array(CheckSchema).min(1),
});
export type Principle = z.infer<typeof PrincipleSchema>;

// How the software came to exist. Stated because a project whose pitch is
// "check us, do not trust us" cannot be coy about its own authorship.
export const ProvenanceSchema = z.object({
  summary: nonEmpty(1200),
  authorship: nonEmpty(1200),
  reviewed: nonEmpty(800),
  // What is tested and what is not, in plain numbers.
  testing: nonEmpty(800),
  // Things a reader should weigh before trusting this with anything that matters.
  cautions: z.array(nonEmpty(400)).min(1),
  repository: z.string().url().max(200).optional(),
  license: nonEmpty(60).optional(),
});

// A question the app answers about itself. The answer must carry limits, and
// may carry a live figure pulled from the running system, so an answer about
// the present is never a stale sentence.
export const QuestionSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,60}$/),
  question: nonEmpty(200),
  answer: nonEmpty(1500),
  // Where the answer stops being true, or what it leaves out. Required.
  limits: z.array(nonEmpty(400)).min(1, "every answer must state its limits"),
  // The name of a live figure (see LIVE_STATE in manifest.live.ts). Optional,
  // but when present it must resolve, which the smoke test checks.
  liveState: z.array(nonEmpty(60)).default([]),
  seeAlso: z.array(CheckSchema).default([]),
  sources: z.array(SourceSchema).default([]),
});
export type Question = z.infer<typeof QuestionSchema>;

export const ManifestSchema = z.object({
  version: z.number().int().min(1),
  name: nonEmpty(60),
  tagline: nonEmpty(200),
  mission: nonEmpty(2000),
  // The one-paragraph honest summary of what this is not.
  notThis: nonEmpty(1200),
  principles: z.array(PrincipleSchema).min(1),
  capabilities: z.array(CapabilitySchema).min(1),
  provenance: ProvenanceSchema,
  questions: z.array(QuestionSchema).min(1),
  sources: z.array(SourceSchema).min(1),
});
export type Manifest = z.infer<typeof ManifestSchema>;

// Parse and fail loudly. Called at import time by manifest.ts, so a manifest
// that breaks the shape breaks the build rather than shipping quietly.
export function parseManifest(input: unknown): Manifest {
  const result = ManifestSchema.safeParse(input);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`The manifest does not satisfy its own schema:\n${problems}`);
  }
  return result.data;
}
