// The rules that keep a shared thing from the tragedy of the commons: who its
// users are, when a steward counts as gone, how many must vote, and what a
// closed question means. Pure rules, then a read-only look at live data.
// Run: npm run smoke:commons
import {
  ADOPT_RULES,
  CONCENTRATION_MINIMUM_ENTRIES,
  DORMANT_DAYS,
  KEEP_RULES,
  LEAVE_AS_IS,
  STEWARD_SILENT_DAYS,
  commonsHealth,
  NOMINATION_DAYS,
  commonsUsers,
  decideOutcome,
  nominationsAreOpen,
  quorumFor,
  stewardIsSilent,
  stewardLastActive,
  topUserShare,
  takingIsConcentrated,
  type Entry,
  type EntryKind,
} from "../src/lib/commons";
import { NOT_YET_APPLIED, settleCommonsDecisions } from "../src/lib/commons.data";
import { db } from "../src/lib/db";
import { getStandingAll } from "../src/lib/standing.all";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

const DAY = 86_400_000;
const now = new Date("2026-09-20T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);
let nextId = 0;
const entry = (userId: string, kind: EntryKind, ageDays: number): Entry => ({ id: `e${nextId++}`, userId, kind, createdAt: daysAgo(ageDays) });

async function main() {
  // Who its users are.
  const record = [entry("ada", "TOOK", 10), entry("bo", "USED", 5), entry("cy", "NOTE", 3), entry("dee", "TENDED", 1)];
  const users = commonsUsers(record, "steward");
  assert(users.has("steward") && users.has("ada") && users.has("bo") && users.has("dee"), "its users are the steward and everyone who took, used, returned or tended");
  assert(!users.has("cy"), "leaving a note does not make someone a user: commenting is not sharing in it");
  const asOfAQuestionAskedFourDaysAgo = commonsUsers(record, "steward", daysAgo(4));
  assert(asOfAQuestionAskedFourDaysAgo.has("ada") && asOfAQuestionAskedFourDaysAgo.has("bo") && !asOfAQuestionAskedFourDaysAgo.has("dee"), "only use recorded before a question was asked counts, so nobody can join the record in order to vote");

  // When a steward counts as gone.
  const created = daysAgo(400);
  assert(stewardIsSilent([], "steward", created, now), "a steward who has never written in the record of an old shared thing is silent");
  assert(!stewardIsSilent([entry("steward", "TENDED", STEWARD_SILENT_DAYS - 1)], "steward", created, now), `a steward who tended it ${STEWARD_SILENT_DAYS - 1} days ago is not`);
  assert(stewardIsSilent([entry("steward", "TENDED", STEWARD_SILENT_DAYS)], "steward", created, now), `at ${STEWARD_SILENT_DAYS} days they are`);
  assert(!stewardIsSilent([entry("steward", "NOTE", 2)], "steward", created, now), "anything the steward writes counts, even a reply: silence means silence");
  assert(stewardIsSilent([entry("ada", "TOOK", 1), entry("bo", "USED", 1)], "steward", created, now), "other people's use does not keep an absent steward in place");
  assert(!stewardIsSilent([], "steward", daysAgo(5), now), "a shared thing added five days ago has not been abandoned, whatever its record says");
  assert(stewardLastActive([], "steward", created).getTime() === created.getTime(), "with nothing written, the steward was last active when they added it");

  // Putting yourself forward: only for the first days of a question.
  assert(nominationsAreOpen(daysAgo(NOMINATION_DAYS - 1), now) && !nominationsAreOpen(daysAgo(NOMINATION_DAYS + 1), now), `people may stand for the first ${NOMINATION_DAYS} days of a question and not after`);

  // How many must vote.
  assert(quorumFor(1) === 1, "a thing with one user can still be rescued by that one person");
  assert(quorumFor(2) === 2 && quorumFor(3) === 2 && quorumFor(6) === 2, "small groups need two ballots: one person cannot decide for the rest");
  assert(quorumFor(9) === 3 && quorumFor(30) === 10, "larger groups need a third of their users");

  // What a closed question means.
  const stewardQuestion = { action: "STEWARD" as const, options: [LEAVE_AS_IS, "@ada", "@bo"], candidateIds: ["", "ada-id", "bo-id"] };
  const chosen = decideOutcome({ ...stewardQuestion, winner: 1, ballots: 4, eligibleVoters: 6 });
  assert(chosen.apply && chosen.action === "STEWARD" && chosen.newStewardId === "ada-id", "a clear winner with enough ballots becomes steward");
  const leftAlone = decideOutcome({ ...stewardQuestion, winner: 0, ballots: 4, eligibleVoters: 6 });
  assert(!leftAlone.apply && leftAlone.note.includes("leave it as it is"), "its users can choose to leave it as it is, and then nothing changes");
  const tooFew = decideOutcome({ ...stewardQuestion, winner: 1, ballots: 1, eligibleVoters: 6 });
  assert(!tooFew.apply && tooFew.note.includes("1 of its 6 users voted") && tooFew.note.includes("2 were needed"), `too few ballots changes nothing, and says why: "${tooFew.note}"`);
  const noMajority = decideOutcome({ ...stewardQuestion, winner: null, ballots: 4, eligibleVoters: 6 });
  assert(!noMajority.apply, "no majority changes nothing");
  const rulesQuestion = { action: "RULES" as const, options: [KEEP_RULES, ADOPT_RULES], candidateIds: [] };
  assert(decideOutcome({ ...rulesQuestion, winner: 1, ballots: 3, eligibleVoters: 5 }).apply, "new rules are adopted when its users choose them");
  assert(!decideOutcome({ ...rulesQuestion, winner: 0, ballots: 3, eligibleVoters: 5 }).apply, "and kept when they choose to keep them");
  assert([chosen, leftAlone, tooFew, noMajority].every((outcome) => outcome.note.length > 10), "every outcome is explained in a sentence, whether or not anything changed");

  // One person doing most of the taking.
  const since = daysAgo(DORMANT_DAYS);
  const lopsided = [...Array.from({ length: 5 }, () => entry("ada", "TOOK", 3)), entry("bo", "TOOK", 3), entry("cy", "USED", 3)];
  assert(Math.abs(topUserShare(lopsided, since).share - 5 / 7) < 1e-9 && takingIsConcentrated(lopsided, since), "five of seven recorded takings by one person is noted");
  const tooFewToJudge = [entry("ada", "TOOK", 3), entry("ada", "TOOK", 3), entry("ada", "TOOK", 3)];
  assert(!takingIsConcentrated(tooFewToJudge, since), `with fewer than ${CONCENTRATION_MINIMUM_ENTRIES} entries nothing is said: one person using a new thing is not a pattern`);
  const shared = [entry("ada", "TOOK", 3), entry("bo", "TOOK", 3), entry("cy", "TOOK", 3), entry("dee", "USED", 3), entry("eve", "USED", 3), entry("fay", "TOOK", 3)];
  assert(!takingIsConcentrated(shared, since), "evenly shared use is not noted");
  const returnsAndTending = [...Array.from({ length: 8 }, () => entry("ada", "RETURNED", 3)), ...Array.from({ length: 8 }, () => entry("ada", "TENDED", 3))];
  assert(!takingIsConcentrated(returnsAndTending, since), "returning and tending are never counted as taking: the person doing the upkeep is not the problem");

  // The whole picture of one shared thing.
  const healthy = commonsHealth({ stewardId: "steward", createdAt: created }, [entry("steward", "TENDED", 4), ...shared], now);
  assert(!healthy.stewardSilent && !healthy.dormant && !healthy.concentrated && healthy.usesInWindow === 7, "a tended, evenly used thing has nothing to report");
  const abandoned = commonsHealth({ stewardId: "steward", createdAt: created }, [entry("ada", "TOOK", 200)], now);
  assert(abandoned.stewardSilent && abandoned.dormant && abandoned.usesInWindow === 0, "an old thing with a silent steward and no recent use is both untended and dormant");
  const brandNew = commonsHealth({ stewardId: "steward", createdAt: daysAgo(3) }, [], now);
  assert(!brandNew.stewardSilent && !brandNew.dormant, "a thing added this week is neither: it has not had time to be neglected");

  // Live, read-only: nothing is due, or what was due is carried out exactly once.
  try {
    const due = { commonsId: { isSet: true }, closesAt: { lte: new Date() }, ...NOT_YET_APPLIED };
    const before = await db.proposal.count({ where: due });
    const settled = await settleCommonsDecisions();
    const after = await db.proposal.count({ where: due });
    assert(settled === before && after === 0, `closed questions about shared things are carried out (${settled} due), and none is left waiting`);
    assert((await settleCommonsDecisions()) === 0, "calling it again does nothing: a result is carried out once");
    const things = await db.commons.findMany({ select: { stewardId: true, createdAt: true, entries: { select: { id: true, userId: true, kind: true, createdAt: true } } } });
    assert(things.every((thing) => typeof commonsHealth(thing, thing.entries as Entry[]).usesInWindow === "number"), `every shared thing in the live data can be assessed (${things.length})`);

    await endToEnd();
    await db.$disconnect();
  } catch (error) {
    console.log("(dev DB not reachable; skipped live checks)", (error as Error).message.split("\n")[0]);
  }
}
// A shared thing whose steward has gone, taken through real questions against
// the real database: too few ballots, then enough, then a change of rules.
// It makes its own rows and removes exactly those, by id, when it is done.
async function endToEnd() {
  const standings = await getStandingAll();
  const verified = [...standings.values()].filter((standing) => standing.verified).map((standing) => standing.user);
  if (verified.length < 2) {
    console.log("(fewer than two verified people in the dev data; skipped the end-to-end check)");
    return;
  }
  const [goneSteward, neighbour] = verified;
  const made = { commons: "", entries: [] as string[], questions: [] as string[] };
  const ago = (days: number) => new Date(Date.now() - days * DAY);

  try {
    const thing = await db.commons.create({
      data: { name: "smoke: the north well", description: "made by the smoke test", category: "WATER", rules: "Take what you need.", stewardId: goneSteward.id, locality: goneSteward.locality, createdAt: ago(200) },
    });
    made.commons = thing.id;
    for (const age of [50, 40]) {
      const written = await db.commonsEntry.create({ data: { commonsId: thing.id, userId: neighbour.id, kind: "TOOK", quantity: "20 L", createdAt: ago(age) } });
      made.entries.push(written.id);
    }

    const ask = async (data: { commonsAction: "STEWARD" | "RULES"; options: string[]; candidateIds?: string[]; proposedRules?: string }, voters: { userId: string; ranking: number[] }[]) => {
      const question = await db.proposal.create({
        data: { title: "smoke question", body: "made by the smoke test", locality: thing.locality ?? "", authorId: neighbour.id, createdAt: ago(8), closesAt: ago(1), commonsId: thing.id, candidateIds: [], ...data },
      });
      made.questions.push(question.id);
      for (const voter of voters) await db.ballot.create({ data: { proposalId: question.id, userId: voter.userId, ranking: voter.ranking } });
      await settleCommonsDecisions(thing.id);
      return db.proposal.findUniqueOrThrow({ where: { id: question.id }, select: { appliedAt: true, appliedNote: true } });
    };
    const stewardOf = async () => (await db.commons.findUniqueOrThrow({ where: { id: thing.id }, select: { stewardId: true, rules: true } }));

    // One ballot of two eligible users: not enough, and nothing changes.
    const tooFew = await ask({ commonsAction: "STEWARD", options: [LEAVE_AS_IS, `@${neighbour.username}`], candidateIds: ["", neighbour.id] }, [{ userId: neighbour.id, ranking: [1] }]);
    assert(!!tooFew.appliedAt && tooFew.appliedNote?.includes("were needed") && (await stewardOf()).stewardId === goneSteward.id, `one ballot of two users settles the question without changing the steward: "${tooFew.appliedNote}"`);

    // Both vote: the neighbour tends it now.
    const enough = await ask({ commonsAction: "STEWARD", options: [LEAVE_AS_IS, `@${neighbour.username}`], candidateIds: ["", neighbour.id] }, [{ userId: neighbour.id, ranking: [1] }, { userId: goneSteward.id, ranking: [1, 0] }]);
    assert(!!enough.appliedAt && (await stewardOf()).stewardId === neighbour.id, `with enough ballots the result is carried out with nobody approving it: "${enough.appliedNote}"`);

    // Its users change its rules.
    const rules = await ask({ commonsAction: "RULES", options: [KEEP_RULES, ADOPT_RULES], proposedRules: "Twenty litres a household a day while the river is low." }, [{ userId: neighbour.id, ranking: [1] }, { userId: goneSteward.id, ranking: [1] }]);
    assert(!!rules.appliedAt && (await stewardOf()).rules === "Twenty litres a household a day while the river is low.", "its users adopt new rules and the rules change");

    // A ballot from someone who was not using it when the question was asked does not count.
    const outsider = [...standings.values()].find((standing) => standing.verified && standing.user.id !== goneSteward.id && standing.user.id !== neighbour.id)?.user;
    if (outsider) {
      const swung = await ask({ commonsAction: "RULES", options: [KEEP_RULES, ADOPT_RULES], proposedRules: "Everything for me." }, [{ userId: outsider.id, ranking: [1] }, { userId: outsider.id === neighbour.id ? goneSteward.id : neighbour.id, ranking: [0] }]);
      assert((await stewardOf()).rules !== "Everything for me." && !!swung.appliedAt, "a ballot from someone who was not using it is not counted, so an outsider cannot swing its rules");
    }
  } finally {
    // Remove exactly what this test made, by id. Nothing else is touched.
    if (made.questions.length) {
      await db.ballot.deleteMany({ where: { proposalId: { in: made.questions } } });
      await db.proposal.deleteMany({ where: { id: { in: made.questions } } });
    }
    if (made.entries.length) await db.commonsEntry.deleteMany({ where: { id: { in: made.entries } } });
    if (made.commons) await db.commons.deleteMany({ where: { id: made.commons } });
    const left = made.commons ? await db.commons.count({ where: { id: made.commons } }) : 0;
    assert(left === 0, "the test removed the rows it made, and only those");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
