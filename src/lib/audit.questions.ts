import { MANIFEST } from "./manifest";
import type { Capability, Check, Principle, Question } from "./manifest.schema";

// Questions that audit the manifest's claims, in the shape TypeSafe AI's
// System One model (Jev) takes: a question with its permitted answers defined
// in advance, answered against supplied state, returning a typed answer with
// probabilities and a confidence value.
//
// Why a model at all, in a project whose whole posture is "check, do not
// trust": because two different kinds of claim live in the manifest, and only
// one of them can be settled by code.
//
//   Mechanical claims ("the books balance", "a forged vouch is refused") are
//   settled by the smoke scripts. Those are proofs. Nothing here replaces them.
//
//   Prose claims ("this capability honestly states what it cannot do", "this
//   answer does not oversell") cannot be settled by code at all. Today the
//   only check on them is whether the author was in an honest mood. These
//   questions put that judgment in front of something that did not write the
//   prose, with its answer space fixed in advance so it cannot wander, and
//   with the deterministic evidence supplied as state so it is judging the
//   claim against the code rather than against its own impressions.
//
// The result is evidence, never authority. A probability is not a proof, and
// nothing in the running app consults it: this is a build-time audit whose
// output is findings for a person to read, exactly like the critic page.
//
// This module is pure. It builds the questions and the state; the script
// (scripts/audit-claims.ts) gathers evidence and sends them. With no API key
// it still prints the whole question set, so the audit can be run elsewhere,
// by hand, or by another model.

// ---------------------------------------------------------------------------
// The question shapes, written as plain data so this file needs no SDK.
// scripts/audit-claims.ts converts them with choice()/noul()/score().
// ---------------------------------------------------------------------------

export type ChoiceSpec = { type: "choice"; instructions: string; criteria: Record<string, string> };
export type NoulSpec = { type: "noul"; instructions: string; criteria?: { true: string; false: string } };
// A score needs an ordered rubric of at least two levels, lowest first. The
// tuple type says so, matching what the API accepts (two to ten levels).
export type ScoreSpec = { type: "score"; instructions: string; criteria: readonly [string, string, ...string[]] };
export type QuestionSpec = ChoiceSpec | NoulSpec | ScoreSpec;
export const SCORE_LEVEL_LIMIT = 10;

// One claim, the evidence gathered for it, and what to ask about it.
export type ClaimAudit = {
  id: string;
  kind: "principle" | "capability" | "answer" | "provenance";
  // The text being audited, shown in the report.
  claim: string;
  // What the script must gather before asking: scripts to run, files to read.
  evidenceFrom: Check[];
  state: Record<string, unknown>;
  questions: Record<string, QuestionSpec>;
};

// The citation-check relation, reused wherever a claim is judged against
// evidence rather than against taste.
const RELATION: ChoiceSpec["criteria"] = {
  supports: "The evidence states the claim or directly implies that it is true.",
  contradicts: "The evidence states the opposite of the claim, or implies it is false.",
  says_nothing: "The evidence does not address what the claim asserts, either way.",
};

// ---------------------------------------------------------------------------
// Principles: does the code show the principle holding, and could its own
// falsification condition actually be tested?
// ---------------------------------------------------------------------------

function auditPrinciple(principle: Principle): ClaimAudit {
  return {
    id: `principle:${principle.key}`,
    kind: "principle",
    claim: principle.statement,
    evidenceFrom: principle.enforcedBy,
    state: {
      principle: principle.statement,
      reasoning: principle.because,
      would_be_broken_if: principle.brokenIf,
    },
    questions: {
      // The citation-check pattern: judge the claim against the evidence,
      // not against the reader's prior.
      evidence_relation: {
        type: "choice",
        instructions: "How does the supplied evidence relate to the principle stated in the state?",
        criteria: RELATION,
      },
      // A principle whose falsification condition is unfalsifiable is
      // decoration, and the schema cannot detect that.
      falsifiable: {
        type: "noul",
        instructions:
          "Read would_be_broken_if. Could a person actually determine whether that condition has occurred, by reading the code or observing the running system?",
        criteria: {
          true: "The condition names something concrete and observable that a person could go and check.",
          false: "The condition is vague, subjective, or could never be observed, so the principle cannot be held against anyone.",
        },
      },
      evidence_strength: {
        type: "score",
        instructions: "How strongly does the supplied evidence actually establish the principle, as opposed to merely being related to it?",
        criteria: [
          "The evidence does not bear on the principle at all.",
          "The evidence is topically related but establishes nothing about whether the principle holds.",
          "The evidence supports part of the principle, leaving important parts unestablished.",
          "The evidence establishes the principle for the cases it covers, with gaps a reader should know about.",
          "The evidence establishes the principle conclusively for anyone who runs it.",
        ],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Capabilities: is the limitation section a real disclosure, and is the
// capability claim actually supported by the check it names?
// ---------------------------------------------------------------------------

function auditCapability(capability: Capability): ClaimAudit {
  return {
    id: `capability:${capability.key}`,
    kind: "capability",
    claim: capability.does,
    evidenceFrom: capability.verifiedBy,
    state: {
      capability: capability.name,
      status: capability.status,
      does: capability.does,
      does_not: capability.doesNot,
    },
    questions: {
      evidence_relation: {
        type: "choice",
        instructions: "How does the supplied evidence relate to the claim in `does`?",
        criteria: RELATION,
      },
      // The question the schema exists to force, asked of the prose the
      // schema could only require to be non-empty.
      limits_honest: {
        type: "choice",
        instructions:
          "Read `does_not`. These are the limitations the software publishes about itself, to people who may rely on it in an emergency. What kind of disclosure is this?",
        criteria: {
          candid:
            "It names real weaknesses a user would want to know and would not discover on their own, including ones that reflect badly on the software.",
          partial: "It names some real limitations but reads as though the most uncomfortable ones were left out.",
          marketing:
            "It restates the feature, describes limits that are obvious or flattering, or frames a weakness as a virtue.",
        },
      },
      // The gap a schema can never catch: a limitation that should be there
      // and is not.
      omits_material_limit: {
        type: "noul",
        instructions:
          "Given what this capability does, is there a material limitation a careful user would want disclosed that `does_not` fails to mention?",
        criteria: {
          true: "A significant limitation, failure mode, or risk is missing from the disclosure.",
          false: "The disclosure covers the limitations that matter for this capability.",
        },
      },
      overstates: {
        type: "noul",
        instructions: "Does `does` claim more than the supplied evidence and the stated limitations can support?",
        criteria: {
          true: "The description promises capability, safety, or certainty beyond what is evidenced.",
          false: "The description stays within what the evidence and the stated limits support.",
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Answers: an answer to a member's question must not oversell, and its stated
// limits must be where the answer actually stops.
// ---------------------------------------------------------------------------

function auditAnswer(question: Question): ClaimAudit {
  return {
    id: `answer:${question.key}`,
    kind: "answer",
    claim: question.question,
    evidenceFrom: question.seeAlso,
    state: {
      question: question.question,
      answer: question.answer,
      stated_limits: question.limits,
    },
    questions: {
      evidence_relation: {
        type: "choice",
        instructions: "How does the supplied evidence relate to the answer given in the state?",
        criteria: RELATION,
      },
      limits_adequate: {
        type: "noul",
        instructions:
          "Do `stated_limits` cover the places where this answer stops being true, including anything in it that a reader could reasonably take further than it should be taken?",
        criteria: {
          true: "The limits name where the answer stops, including the uncomfortable parts.",
          false: "The answer can be read as promising something the limits do not walk back.",
        },
      },
      // The project's copy rule, audited: written for a frightened person.
      plain_for_a_frightened_person: {
        type: "score",
        instructions:
          "This will be read by a tired, frightened person with no technical background, deciding whether to rely on this software. How well does the answer serve that reader?",
        criteria: [
          "Unreadable for them: jargon, or so long they will stop.",
          "Technically accurate but written for a developer.",
          "Mostly plain, with some terms or length that would lose them.",
          "Plain and direct, and they would know what it means for them.",
          "Plain, direct, and it tells them what to do or expect next.",
        ],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Provenance: the disclosures that matter most, because they are the ones the
// author has the most reason to soften.
// ---------------------------------------------------------------------------

function auditProvenance(): ClaimAudit {
  const provenance = MANIFEST.provenance;
  return {
    id: "provenance",
    kind: "provenance",
    claim: "How this software was built, and by whom.",
    evidenceFrom: [
      { kind: "file", ref: "AGENTS.md", what: "The conventions the code was written to." },
      { kind: "file", ref: "docs/reading-guide.md", what: "Each rule mapped to its file, function and test." },
    ],
    state: {
      summary: provenance.summary,
      authorship: provenance.authorship,
      reviewed: provenance.reviewed,
      testing: provenance.testing,
      cautions: provenance.cautions,
    },
    questions: {
      ai_authorship_clear: {
        type: "noul",
        instructions:
          "Would a non-technical reader finish `authorship` understanding that the code was written by an AI system rather than by a human engineer?",
        criteria: {
          true: "It is stated plainly enough that the reader cannot miss it.",
          false: "It is hedged, buried, or phrased so the reader could come away thinking people wrote it.",
        },
      },
      audit_status_clear: {
        type: "noul",
        instructions: "Would that reader finish `reviewed` understanding that nobody independent has audited this software?",
        criteria: {
          true: "The absence of outside review is stated without softening.",
          false: "The wording leaves room to believe it has been reviewed.",
        },
      },
      testing_honest: {
        type: "choice",
        instructions:
          "Read `testing`. Self-written tests show that code matches its author's intent, not that the intent was right. How does this description handle that?",
        criteria: {
          states_the_limit: "It says plainly that the tests were written by the same author and what that does and does not show.",
          implies_more: "It describes the tests in a way that implies more assurance than self-written tests provide.",
          silent: "It does not address the question at all.",
        },
      },
      cautions_serious: {
        type: "score",
        instructions:
          "Weigh `cautions` against the fact that people may run their food, water and medical coordination on this. How seriously do they treat that?",
        criteria: [
          "Boilerplate: legal cover, nothing a reader would act on.",
          "Generic warnings that apply to any software.",
          "Real but partial: some consequences named, the worst left out.",
          "Concrete about what could go wrong and what it would cost a person.",
          "Concrete, and they tell the reader what to do about it.",
        ],
      },
      // The one that would be easiest to leave out.
      omits_uncomfortable_fact: {
        type: "noul",
        instructions:
          "Is there something about how this software was built, or its current state, that a person deciding whether to rely on it would want to know and that this provenance does not say?",
        criteria: {
          true: "A material fact about its construction, review or maturity is missing.",
          false: "The uncomfortable facts are on the page.",
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Whole-manifest questions, asked once with every claim in the state.
// ---------------------------------------------------------------------------

export function auditWholeManifest(): ClaimAudit {
  return {
    id: "manifest",
    kind: "provenance",
    claim: MANIFEST.mission,
    evidenceFrom: [{ kind: "file", ref: "BUILD_PROMPT.md", what: "The constitution the software was built from." }],
    state: {
      mission: MANIFEST.mission,
      what_this_is_not: MANIFEST.notThis,
      principles: MANIFEST.principles.map((principle) => principle.statement),
      capabilities: MANIFEST.capabilities.map((capability) => ({ name: capability.name, does: capability.does, does_not: capability.doesNot })),
    },
    questions: {
      overall_honesty: {
        type: "score",
        instructions:
          "Taken as a whole, how does this self-description treat a reader who is deciding whether to trust the software with something that matters?",
        criteria: [
          "It sells. A reader would form a materially wrong impression.",
          "It is accurate about features and quiet about weaknesses.",
          "It is balanced, though a reader would still be surprised by some things later.",
          "It is candid: the weaknesses are where a reader will find them, not buried.",
          "It is candid to its own cost, naming things that make the software look worse.",
        ],
      },
      mission_matches_capabilities: {
        type: "choice",
        instructions: "How do the listed capabilities relate to what the mission says the software is for?",
        criteria: RELATION,
      },
      promises_beyond_software: {
        type: "noul",
        instructions:
          "Does this description promise social outcomes (that people will cooperate, that a community will hold together, that harm will be repaired) as though the software could deliver them, rather than merely provide tools?",
        criteria: {
          true: "It claims outcomes that depend on people, as if the software produced them.",
          false: "It stays within what software can do and leaves the outcomes to people.",
        },
      },
    },
  };
}

// Every claim in the manifest, with its questions. One System One request per
// claim: several questions in one call, which the documentation's parallel
// pattern shows is both cheaper and faster than asking them separately.
export function buildClaimAudits(): ClaimAudit[] {
  return [
    ...MANIFEST.principles.map(auditPrinciple),
    ...MANIFEST.capabilities.map(auditCapability),
    ...MANIFEST.questions.map(auditAnswer),
    auditProvenance(),
    auditWholeManifest(),
  ];
}

// ---------------------------------------------------------------------------
// Reading the answers. Thresholds follow the documentation: act above 0.9,
// proceed with caution in between, do not act below 0.5. Here "act" only ever
// means "print this finding without asking a person to look again", because
// nothing here acts on anything.
// ---------------------------------------------------------------------------

export const CONFIDENCE = { act: 0.9, review: 0.5 } as const;

export type Verdict = "clean" | "finding" | "needs-a-person";

export function verdictFor(opts: { troubling: boolean; confidence: number }): Verdict {
  if (opts.confidence < CONFIDENCE.review) return "needs-a-person";
  if (!opts.troubling) return "clean";
  return opts.confidence >= CONFIDENCE.act ? "finding" : "needs-a-person";
}

// A noul is a probability that the answer is yes, and needs no separate
// confidence: 0.5 is maximum uncertainty, and distance from it is how sure
// the model is either way.
export function noulVerdict(probability: number, yesIsTroubling: boolean): Verdict {
  const troubling = yesIsTroubling ? probability > 0.5 : probability < 0.5;
  const certainty = Math.abs(probability - 0.5) * 2;
  return verdictFor({ troubling, confidence: certainty });
}

// The answer shapes the API returns.
export type Answer =
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "noul"; noul: number }
  | { type: "score"; score: number; confidence: number };

// Which answer to each question means something is wrong. Kept here beside
// the questions so a test can prove every question has a reading: a question
// nobody knows how to read is a question that quietly always passes.
//
// For a choice, the one answer that is fine. For a score, the lowest
// acceptable position on the rubric. For a noul, whether yes is the bad news.
export const ACCEPTABLE_CHOICE: Record<string, string> = {
  evidence_relation: "supports",
  mission_matches_capabilities: "supports",
  limits_honest: "candid",
  testing_honest: "states_the_limit",
};

export const MINIMUM_SCORE: Record<string, number> = {
  evidence_strength: 2.5,
  plain_for_a_frightened_person: 2.5,
  cautions_serious: 2.5,
  overall_honesty: 3,
};

export const NOUL_YES_IS_TROUBLING: Record<string, boolean> = {
  falsifiable: false,
  omits_material_limit: true,
  overstates: true,
  limits_adequate: false,
  ai_authorship_clear: false,
  audit_status_clear: false,
  omits_uncomfortable_fact: true,
  promises_beyond_software: true,
};

export function hasReading(questionKey: string): boolean {
  return questionKey in ACCEPTABLE_CHOICE || questionKey in MINIMUM_SCORE || questionKey in NOUL_YES_IS_TROUBLING;
}

// Turn one answer into a verdict and a line a person can read.
export function readAnswer(questionKey: string, answer: Answer): { verdict: Verdict; reading: string } {
  if (answer.type === "noul") {
    const yesIsTroubling = NOUL_YES_IS_TROUBLING[questionKey];
    if (yesIsTroubling === undefined) return { verdict: "needs-a-person", reading: `${questionKey}: no reading defined` };
    return { verdict: noulVerdict(answer.noul, yesIsTroubling), reading: `${questionKey}: ${(answer.noul * 100).toFixed(0)}% yes` };
  }
  if (answer.type === "choice") {
    const acceptable = ACCEPTABLE_CHOICE[questionKey];
    if (acceptable === undefined) return { verdict: "needs-a-person", reading: `${questionKey}: no reading defined` };
    return {
      verdict: verdictFor({ troubling: answer.choice !== acceptable, confidence: answer.confidence }),
      reading: `${questionKey}: ${answer.choice.replace(/_/g, " ")} (confidence ${answer.confidence.toFixed(2)})`,
    };
  }
  const minimum = MINIMUM_SCORE[questionKey];
  if (minimum === undefined) return { verdict: "needs-a-person", reading: `${questionKey}: no reading defined` };
  return {
    verdict: verdictFor({ troubling: answer.score < minimum, confidence: answer.confidence }),
    reading: `${questionKey}: ${answer.score.toFixed(2)} (needs ${minimum}, confidence ${answer.confidence.toFixed(2)})`,
  };
}
