// How a shared thing avoids the tragedy of the commons, with nobody in charge.
//
// Hardin's tragedy is what happens to something shared that has a name and
// nothing else. Ostrom's answer, from commons that lasted centuries, is a
// short list: it must be clear who its users are, the users must be able to
// change its rules, use must be visible to the people who share it, and the
// first response to a problem must be a small one. The software cannot and
// should not ration a well. What it can do is keep the record those things
// depend on, and carry out what the users decide, because there is no one
// else to carry it out.
//
// This file is pure: the rules, with no database. commons.data.ts applies them.

export type EntryKind = "TOOK" | "RETURNED" | "USED" | "TENDED" | "NOTE";

export type Entry = { id: string; userId: string; kind: EntryKind; createdAt: Date; aboutEntryId?: string | null };

export const ENTRY_LABEL: Record<EntryKind, string> = {
  TOOK: "took",
  RETURNED: "returned",
  USED: "used",
  TENDED: "tended",
  NOTE: "said",
};

export const ENTRY_HINT: Record<Exclude<EntryKind, "NOTE">, string> = {
  TOOK: "You took something away: water, a tool, seed.",
  RETURNED: "You brought it back.",
  USED: "You used it where it is: the kitchen, the radio, the workshop.",
  TENDED: "You looked after it: a check, a repair, a clean. Say what state it is in.",
};

const DAY = 86_400_000;

// A steward who has written nothing in the record for this long is treated as
// gone, and the users may decide who tends the thing now. It is measured from
// the record of this one shared thing, not from whether the person logs in:
// the app does not track when people are here, and a steward who is around
// but never tends the thing is silent as far as its users can tell.
export const STEWARD_SILENT_DAYS = 60;
// A shared thing nobody has recorded using for this long is called dormant.
export const DORMANT_DAYS = 90;
// How long its users have to decide a question about it.
export const DECISION_DAYS = 7;
// During a question about who should be steward, how long people may put
// themselves forward.
export const NOMINATION_DAYS = 3;
// A person may leave this many notes on one shared thing in a day. Notes are
// public and signed, and there is no moderator, so the limit is the guard.
export const NOTES_PER_DAY = 5;

export const LEAVE_AS_IS = "Leave it as it is";
export const KEEP_RULES = "Keep the rules as they are";
export const ADOPT_RULES = "Adopt the new rules";

// The kinds of entry that make someone a user of the thing. Leaving a note
// does not: a person who has only commented has not shared in it.
const USE_KINDS: EntryKind[] = ["TOOK", "RETURNED", "USED", "TENDED"];

// Who its users are: everyone with a use entry, and the steward. With `before`
// set, only entries made before that moment count, so nobody can join the
// record after a question is asked in order to vote on it.
export function commonsUsers(entries: Entry[], stewardId: string, before?: Date): Set<string> {
  const users = new Set<string>([stewardId]);
  for (const entry of entries) {
    if (!USE_KINDS.includes(entry.kind)) continue;
    if (before && entry.createdAt >= before) continue;
    users.add(entry.userId);
  }
  return users;
}

// When the steward last did anything in this record, or when the thing was
// added if they never have.
export function stewardLastActive(entries: Entry[], stewardId: string, createdAt: Date): Date {
  let latest = createdAt;
  for (const entry of entries) if (entry.userId === stewardId && entry.createdAt > latest) latest = entry.createdAt;
  return latest;
}

export function stewardIsSilent(entries: Entry[], stewardId: string, createdAt: Date, now = new Date()): boolean {
  return now.getTime() - stewardLastActive(entries, stewardId, createdAt).getTime() >= STEWARD_SILENT_DAYS * DAY;
}

// Whether people may still put themselves forward on a question about who
// tends a thing: for the first NOMINATION_DAYS after it was asked.
export function nominationsAreOpen(askedAt: Date, now = new Date()): boolean {
  return now.getTime() <= askedAt.getTime() + NOMINATION_DAYS * DAY;
}

export function daysSince(date: Date, now = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / DAY);
}

// How many ballots a decision needs before the software will carry it out. A
// third of the users, at least two, and never more than there are users: a
// thing with one user can still be rescued by that one person.
export function quorumFor(eligibleVoters: number): number {
  return Math.min(eligibleVoters, Math.max(2, Math.ceil(eligibleVoters / 3)));
}

export type DecisionOutcome =
  | { apply: false; note: string }
  | { apply: true; action: "RULES"; note: string }
  | { apply: true; action: "STEWARD"; newStewardId: string; note: string };

// What a closed question means. The software carries out only a clear result:
// enough ballots, a winner, and a winner that asks for a change.
export function decideOutcome(decision: {
  action: "RULES" | "STEWARD";
  options: string[];
  candidateIds: string[];
  winner: number | null;
  ballots: number;
  eligibleVoters: number;
}): DecisionOutcome {
  const needed = quorumFor(decision.eligibleVoters);
  if (decision.ballots < needed) {
    return { apply: false, note: `Nothing changed: ${decision.ballots} of its ${decision.eligibleVoters} users voted, and ${needed} were needed.` };
  }
  if (decision.winner === null) return { apply: false, note: "Nothing changed: no option reached a majority." };

  if (decision.action === "RULES") {
    if (decision.options[decision.winner] !== ADOPT_RULES) return { apply: false, note: "Its users chose to keep the rules as they are." };
    return { apply: true, action: "RULES", note: "Its users adopted the new rules." };
  }

  const newStewardId = decision.candidateIds[decision.winner];
  if (!newStewardId) return { apply: false, note: "Its users chose to leave it as it is." };
  return { apply: true, action: "STEWARD", newStewardId, note: `Its users chose ${decision.options[decision.winner]} to tend it.` };
}

// One person accounting for most of the recorded taking. Judged only once
// there is enough of a record for a share to mean anything.
export const CONCENTRATION_MINIMUM_ENTRIES = 6;
export const CONCENTRATION_SHARE = 0.6;

export function topUserShare(entries: Entry[], since: Date): { share: number; entries: number } {
  const taking = entries.filter((entry) => (entry.kind === "TOOK" || entry.kind === "USED") && entry.createdAt >= since);
  if (taking.length === 0) return { share: 0, entries: 0 };
  const perUser = new Map<string, number>();
  for (const entry of taking) perUser.set(entry.userId, (perUser.get(entry.userId) ?? 0) + 1);
  return { share: Math.max(...perUser.values()) / taking.length, entries: taking.length };
}

export function takingIsConcentrated(entries: Entry[], since: Date): boolean {
  const { share, entries: count } = topUserShare(entries, since);
  return count >= CONCENTRATION_MINIMUM_ENTRIES && share > CONCENTRATION_SHARE;
}

// The state of one shared thing, for the list and for the critic.
export type CommonsHealth = { stewardSilent: boolean; dormant: boolean; concentrated: boolean; usesInWindow: number; lastUseAt: Date | null };

export function commonsHealth(commons: { stewardId: string; createdAt: Date }, entries: Entry[], now = new Date()): CommonsHealth {
  const windowStart = new Date(now.getTime() - DORMANT_DAYS * DAY);
  const uses = entries.filter((entry) => USE_KINDS.includes(entry.kind));
  const lastUseAt = uses.reduce<Date | null>((latest, entry) => (!latest || entry.createdAt > latest ? entry.createdAt : latest), null);
  const oldEnoughToJudge = now.getTime() - commons.createdAt.getTime() >= DORMANT_DAYS * DAY;
  return {
    stewardSilent: stewardIsSilent(entries, commons.stewardId, commons.createdAt, now),
    dormant: oldEnoughToJudge && (!lastUseAt || lastUseAt < windowStart),
    concentrated: takingIsConcentrated(entries, windowStart),
    usesInWindow: uses.filter((entry) => entry.createdAt >= windowStart).length,
    lastUseAt,
  };
}
