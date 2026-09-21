import { commonsUsers, decideOutcome, type Entry } from "./commons";
import { db } from "./db";
import { tallyIRV } from "./rcv";
import { getStandingAll } from "./standing.all";

// Carrying out what a shared thing's users decided. There is no administrator
// to apply a result, so the software does it, the first time anyone looks at
// the thing or the question after voting has closed. Like demurrage, it is
// safe to call from anywhere and does nothing when there is nothing to do.
//
// It is claimed before it is applied: the question is marked as settled inside
// the same transaction that changes the commons, and only the caller whose
// update actually flipped it goes on, so two people loading the page in the
// same second cannot apply a result twice.

// "Not yet carried out." On MongoDB a field that was never written is not the
// same as a field holding null, and a filter for null matches only the second.
// A new question has no appliedAt at all, so both must be asked for, or no
// question would ever be found and nothing its users decide would happen.
export const NOT_YET_APPLIED = { OR: [{ appliedAt: null }, { appliedAt: { isSet: false } }] };

// Who may vote on a question about this thing: its users as of the moment the
// question was asked, who are also verified. Being in the record is what makes
// someone affected; being verified is what stops ten new accounts from
// recording one use each and voting themselves steward of the tool shed.
export async function eligibleVoterIds(commons: { id: string; stewardId: string }, askedAt: Date): Promise<Set<string>> {
  const [entries, standings] = await Promise.all([
    db.commonsEntry.findMany({ where: { commonsId: commons.id }, select: { id: true, userId: true, kind: true, createdAt: true } }),
    getStandingAll(),
  ]);
  const users = commonsUsers(entries as Entry[], commons.stewardId, askedAt);
  return new Set([...users].filter((userId) => standings.get(userId)?.verified));
}

export async function settleCommonsDecisions(commonsId?: string): Promise<number> {
  const due = await db.proposal.findMany({
    where: { commonsId: commonsId ?? { isSet: true }, closesAt: { lte: new Date() }, ...NOT_YET_APPLIED },
    include: { ballots: { select: { userId: true, ranking: true } }, commons: { select: { id: true, stewardId: true } } },
  });

  let settled = 0;
  for (const question of due) {
    if (!question.commons || (question.commonsAction !== "RULES" && question.commonsAction !== "STEWARD")) continue;

    // Only ballots from people who were eligible count, in case someone's
    // verification lapsed or a ballot predates a rule like this one.
    const eligible = await eligibleVoterIds(question.commons, question.createdAt);
    const ballots = question.ballots.filter((ballot) => eligible.has(ballot.userId));
    const tally = tallyIRV(question.options.length, ballots.map((ballot) => ballot.ranking));
    let outcome = decideOutcome({
      action: question.commonsAction,
      options: question.options,
      candidateIds: question.candidateIds,
      winner: tally.winner,
      ballots: ballots.length,
      eligibleVoters: eligible.size,
    });

    // A chosen steward must still be someone who could hold the role.
    if (outcome.apply && outcome.action === "STEWARD") {
      const standings = await getStandingAll();
      if (!standings.get(outcome.newStewardId)?.verified) outcome = { apply: false, note: "Nothing changed: the person chosen is no longer verified." };
    }

    const applied = await db.$transaction(async (tx) => {
      const claim = await tx.proposal.updateMany({ where: { id: question.id, ...NOT_YET_APPLIED }, data: { appliedAt: new Date(), appliedNote: outcome.note } });
      if (claim.count !== 1) return false;
      if (outcome.apply && outcome.action === "RULES") {
        await tx.commons.update({ where: { id: question.commons!.id }, data: { rules: question.proposedRules ?? null } });
      }
      if (outcome.apply && outcome.action === "STEWARD") {
        await tx.commons.update({ where: { id: question.commons!.id }, data: { stewardId: outcome.newStewardId, handoverToId: null, handoverOfferedAt: null } });
      }
      return true;
    });
    if (applied) settled++;
  }
  return settled;
}
