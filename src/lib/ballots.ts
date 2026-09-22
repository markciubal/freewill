import { Prisma } from "@prisma/client";
import { ballotFingerprint, isBallotFingerprint, isBallotKey, shuffled } from "./ballot-seal";
import { eligibleVoterIds } from "./commons.data";
import { db } from "./db";
import { localityKey } from "./form";
import { getStanding } from "./standing.all";

// Casting and changing secret ballots, where the rules in ballot-seal.ts meet
// the database. Every write does two things in one transaction: the voter roll
// learns THAT someone voted, and the question's sealed ballots gain or change
// a ranking with no name and no time, reshuffled. Nothing stored links them.
//
// Who may vote is decided here, when the ballot is cast, because a sealed
// ballot cannot be traced back to its voter afterwards to be struck out.

export type BallotOutcome = { ok: string } | { error: string };

type Question = {
  id: string;
  locality: string;
  options: string[];
  createdAt: Date;
  closesAt: Date;
  commons: { id: string; stewardId: string } | null;
};

const QUESTION_FIELDS = { id: true, locality: true, options: true, createdAt: true, closesAt: true, commons: { select: { id: true, stewardId: true } } } as const;

// Null when this person may vote on this question now; otherwise why not, in
// words they can act on.
export async function whyCannotVote(question: Question, voter: { id: string; locality: string }): Promise<string | null> {
  if (question.closesAt <= new Date()) return "Voting has closed.";
  if (question.commons) {
    // A question about one shared thing belongs to the people who used it
    // when it was asked, wherever they live.
    const eligible = await eligibleVoterIds(question.commons, question.createdAt);
    return eligible.has(voter.id) ? null : "Only verified people who were already using it when this was asked vote on it.";
  }
  if (localityKey(question.locality) !== localityKey(voter.locality)) return `Only people in ${question.locality} vote on this.`;
  const standing = await getStanding(voter.id);
  if (!standing.verified) {
    return `Only verified people vote. You need ${standing.requiredVouches} vouch${standing.requiredVouches === 1 ? "" : "es"} from people in ${voter.locality}.`;
  }
  return null;
}

// Whether this person is on the roll for this question (has voted).
export async function hasVoted(questionId: string, userId: string): Promise<boolean> {
  return !!(await db.voterRoll.findUnique({ where: { proposalId_userId: { proposalId: questionId, userId } }, select: { id: true } }));
}

// A ranking must name real options, each at most once, and at least one.
function rankingProblem(ranking: number[], optionCount: number): string | null {
  if (ranking.length === 0) return "Rank at least one option.";
  if (ranking.some((option) => !Number.isInteger(option) || option < 0 || option >= optionCount)) return "That ballot names an option this question does not have.";
  if (new Set(ranking).size !== ranking.length) return "Each option can be ranked once.";
  return null;
}

// Refusals raised inside a transaction, so it rolls back and the reason
// reaches the person.
class Refused extends Error {}

// Two people voting on one question at the same moment both rewrite its
// sealed ballots; MongoDB lets one through and asks the other to retry.
// Prisma logs each such conflict as "prisma:error ... write conflict" before
// this retries it; that line is expected and nothing was lost.
async function withRetry<T>(work: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      const conflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!conflict || attempt >= attempts) throw error;
    }
  }
}

async function refusalOr(work: () => Promise<BallotOutcome>): Promise<BallotOutcome> {
  try {
    return await withRetry(work);
  } catch (error) {
    if (error instanceof Refused) return { error: error.message };
    throw error;
  }
}

// A first ballot. The browser made the key and sends only its fingerprint.
export async function castSealedBallot(questionId: string, voter: { id: string; locality: string }, ranking: number[], fingerprint: string): Promise<BallotOutcome> {
  if (!isBallotFingerprint(fingerprint)) return { error: "The ballot could not be sealed. Reload the page and try again." };
  const question = await db.proposal.findUnique({ where: { id: questionId }, select: QUESTION_FIELDS });
  if (!question) return { error: "That question no longer exists." };
  const refusal = (await whyCannotVote(question, voter)) ?? rankingProblem(ranking, question.options.length);
  if (refusal) return { error: refusal };

  return refusalOr(() =>
    db.$transaction(async (tx) => {
      const already = await tx.voterRoll.findUnique({ where: { proposalId_userId: { proposalId: questionId, userId: voter.id } }, select: { id: true } });
      if (already) throw new Refused("You have already voted on this. To change your ballot, use the device you voted from, or your ballot key.");
      await tx.voterRoll.create({ data: { proposalId: questionId, userId: voter.id } });
      const { sealedBallots } = await tx.proposal.findUniqueOrThrow({ where: { id: questionId }, select: { sealedBallots: true } });
      if (sealedBallots.some((ballot) => ballot.fingerprint === fingerprint)) throw new Refused("The ballot could not be sealed. Reload the page and try again.");
      await tx.proposal.update({ where: { id: questionId }, data: { sealedBallots: { set: shuffled([...sealedBallots, { fingerprint, ranking }]) } } });
      return { ok: "Your ballot is cast and sealed. Nobody, including whoever runs this server, can read from the records which ballot is yours. You can change it from this device until voting closes." };
    }),
  );
}

// A changed ballot. Only the key itself opens a sealed ballot: its fingerprint
// is public to anyone reading the database, the key is not.
export async function changeSealedBallot(questionId: string, voter: { id: string }, ranking: number[], ballotKey: string): Promise<BallotOutcome> {
  if (!isBallotKey(ballotKey.trim().toLowerCase())) return { error: "That is not a ballot key. It is 64 letters and numbers." };
  const question = await db.proposal.findUnique({ where: { id: questionId }, select: QUESTION_FIELDS });
  if (!question) return { error: "That question no longer exists." };
  if (question.closesAt <= new Date()) return { error: "Voting has closed." };
  const problem = rankingProblem(ranking, question.options.length);
  if (problem) return { error: problem };
  const fingerprint = ballotFingerprint(ballotKey);

  return refusalOr(() =>
    db.$transaction(async (tx) => {
      const onRoll = await tx.voterRoll.findUnique({ where: { proposalId_userId: { proposalId: questionId, userId: voter.id } }, select: { id: true } });
      if (!onRoll) throw new Refused("You have not voted on this yet, so there is no ballot to change.");
      const { sealedBallots } = await tx.proposal.findUniqueOrThrow({ where: { id: questionId }, select: { sealedBallots: true } });
      const mine = sealedBallots.findIndex((ballot) => ballot.fingerprint === fingerprint);
      if (mine < 0) throw new Refused("That ballot key does not open any ballot on this question.");
      const updated = sealedBallots.map((ballot, index) => (index === mine ? { fingerprint, ranking } : ballot));
      await tx.proposal.update({ where: { id: questionId }, data: { sealedBallots: { set: shuffled(updated) } } });
      return { ok: "Your ballot is changed and sealed again. You can change it until voting closes." };
    }),
  );
}
