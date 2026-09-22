// Secret ballots: the sealing rules, then real ballots against the dev
// database. It makes its own questions and removes exactly those, by id.
// Run: npm run smoke:ballots
import "./not-production";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ballotFingerprint, isBallotKey, newBallotKey, readRanking, shuffled } from "../src/lib/ballot-seal";
import { castSealedBallot, changeSealedBallot, hasVoted } from "../src/lib/ballots";
import { db } from "../src/lib/db";
import { localityKey } from "../src/lib/form";
import { getStandingAll } from "../src/lib/standing.all";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

// 1. Sealing, with no database.
const key = newBallotKey();
assert(isBallotKey(key) && key !== newBallotKey(), "a ballot key is 64 random hex characters, fresh each time");
assert(ballotFingerprint(key) === ballotFingerprint(` ${key.toUpperCase()} `) && ballotFingerprint(key) !== ballotFingerprint(newBallotKey()), "a fingerprint is the same for the same key however it is typed, and different for any other key");
assert(ballotFingerprint(key) !== key && /^[0-9a-f]{64}$/.test(ballotFingerprint(key)), "the fingerprint is not the key");
assert(!isBallotKey("not a key") && !isBallotKey("a".repeat(63)), "anything but 64 hex characters is not a key");

const cards = [0, 1, 2, 3, 4];
const deck = shuffled(cards);
assert(deck.length === 5 && [...deck].sort().join() === "0,1,2,3,4" && cards.join() === "0,1,2,3,4", "a shuffle keeps every ballot exactly once and leaves the original alone");
const seen = new Map<string, number>();
for (let run = 0; run < 6000; run++) {
  const order = shuffled(["a", "b", "c"]).join("");
  seen.set(order, (seen.get(order) ?? 0) + 1);
}
assert(seen.size === 6 && [...seen.values()].every((count) => count > 850 && count < 1150), `every order of three ballots is about equally likely (${[...seen.values()].join(", ")} of 6000)`);

const ranks = (values: (string | null)[]) => readRanking(values.length, (option) => values[option]);
assert(JSON.stringify(ranks(["2", null, "1"])) === JSON.stringify({ ranking: [2, 0] }), "ranks become option numbers, first choice first, blanks left out");
assert("error" in ranks([null, null]) && "error" in ranks(["1", "1"]) && "error" in ranks(["1.5", null]) && "error" in ranks(["3", null]), "no ranking, a repeated rank, a fraction, or a rank past the options is refused");

// 2. Nothing else writes a ballot, and the old unsealed ballots are gone.
const root = path.resolve(__dirname, "..");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => (item.isDirectory() ? files(path.join(dir, item.name)) : /\.(ts|tsx)$/.test(item.name) ? [path.join(dir, item.name)] : []));
}
const writers = files(path.join(root, "src")).filter((file) => /sealedBallots:\s*\{\s*(set|push)/.test(readFileSync(file, "utf8"))).map((file) => path.relative(root, file).replace(/\\/g, "/"));
assert(writers.join() === "src/lib/ballots.ts", `only src/lib/ballots.ts writes sealed ballots (${writers.join(", ") || "none"})`);
assert(!files(path.join(root, "src")).some((file) => /db\.ballot\.|tx\.ballot\./.test(readFileSync(file, "utf8"))), "no code reads or writes the old ballots that carried a voter's id");

// 3. Real ballots on the dev database.
async function live() {
  const standings = [...(await getStandingAll()).values()];
  const verified = standings.filter((standing) => standing.verified).map((standing) => standing.user);
  const voter = verified[0];
  if (!voter) {
    console.log("(no verified person in the dev data; skipped the live checks)");
    return;
  }
  const made: string[] = [];
  const ask = async (locality: string) => {
    const question = await db.proposal.create({
      data: { title: "smoke: secret ballot", body: "made by the ballot smoke test", options: ["Yes", "No", "Later"], locality, authorId: voter.id, closesAt: new Date(Date.now() + 86_400_000) },
    });
    made.push(question.id);
    return question.id;
  };

  try {
    const q = await ask(voter.locality);
    const myKey = newBallotKey();
    assert("error" in (await castSealedBallot(q, voter, [0], "not a fingerprint")), "a ballot without a proper fingerprint is refused");
    const cast = await castSealedBallot(q, voter, [0, 2], ballotFingerprint(myKey));
    assert("ok" in cast && (await hasVoted(q, voter.id)), "a verified local casts a sealed ballot and is on the roll");
    const again = await castSealedBallot(q, voter, [1], ballotFingerprint(newBallotKey()));
    assert("error" in again && again.error.includes("already voted"), "casting a second ballot on the same question is refused");

    const stored = await db.proposal.findUniqueOrThrow({ where: { id: q }, select: { sealedBallots: true } });
    const storedText = JSON.stringify(stored.sealedBallots);
    assert(
      stored.sealedBallots.length === 1 && !storedText.includes(voter.id) && !storedText.includes(myKey) && Object.keys(stored.sealedBallots[0]).sort().join() === "fingerprint,ranking",
      "the stored ballot holds a fingerprint and a ranking: not the voter, not the key, not a time",
    );

    const wrongKey = await changeSealedBallot(q, voter, [1], newBallotKey());
    assert("error" in wrongKey && wrongKey.error.includes("does not open"), "a key that is not yours opens nothing");
    const byFingerprint = await changeSealedBallot(q, voter, [1], ballotFingerprint(myKey));
    assert("error" in byFingerprint, "the fingerprint from the database cannot be used as the key, so reading the records does not let anyone change a ballot");
    const changed = await changeSealedBallot(q, voter, [1, 0], myKey);
    const after = await db.proposal.findUniqueOrThrow({ where: { id: q }, select: { sealedBallots: true } });
    assert("ok" in changed && after.sealedBallots.length === 1 && after.sealedBallots[0].ranking.join() === "1,0", "the key changes the ballot in place, still one ballot");
    assert("error" in (await castSealedBallot(q, voter, [7], ballotFingerprint(newBallotKey()))) && "error" in (await changeSealedBallot(q, voter, [7], myKey)), "a ranking naming an option the question does not have is refused");

    // Who may vote is decided when the ballot is cast.
    const elsewhere = await ask(`${voter.locality} (smoke elsewhere)`);
    const outOfPlace = await castSealedBallot(elsewhere, voter, [0], ballotFingerprint(newBallotKey()));
    assert("error" in outOfPlace && outOfPlace.error.includes("Only people in"), "someone from another locality cannot vote on its question");
    const unverified = standings.find((standing) => !standing.verified && localityKey(standing.user.locality) === localityKey(voter.locality))?.user;
    if (unverified) {
      const notYet = await castSealedBallot(q, unverified, [0], ballotFingerprint(newBallotKey()));
      assert("error" in notYet && notYet.error.includes("Only verified people vote"), "someone not yet verified cannot vote");
    }

    // Two neighbours voting at the same moment both count; one person pressing
    // twice at the same moment counts once.
    const neighbour = verified.find((person) => person.id !== voter.id && localityKey(person.locality) === localityKey(voter.locality));
    if (neighbour) {
      const together = await ask(voter.locality);
      const both = await Promise.all([voter, neighbour].map((person) => castSealedBallot(together, person, [0], ballotFingerprint(newBallotKey()))));
      const count = (await db.proposal.findUniqueOrThrow({ where: { id: together }, select: { sealedBallots: true } })).sealedBallots.length;
      assert(both.every((outcome) => "ok" in outcome) && count === 2, "two neighbours voting at the same moment both count");
      const twice = await ask(voter.locality);
      const doubled = await Promise.all([0, 1].map(() => castSealedBallot(twice, voter, [0], ballotFingerprint(newBallotKey()))));
      const kept = (await db.proposal.findUniqueOrThrow({ where: { id: twice }, select: { sealedBallots: true } })).sealedBallots.length;
      assert(doubled.filter((outcome) => "ok" in outcome).length === 1 && kept === 1, "one person voting twice at the same moment is counted once");
    }

    await db.proposal.update({ where: { id: q }, data: { closesAt: new Date(Date.now() - 1000) } });
    assert("error" in (await changeSealedBallot(q, voter, [2], myKey)), "a ballot cannot be changed after voting closes");
  } finally {
    // Remove exactly what this test made, by id. Nothing else is touched.
    await db.voterRoll.deleteMany({ where: { proposalId: { in: made } } });
    await db.proposal.deleteMany({ where: { id: { in: made } } });
    assert((await db.proposal.count({ where: { id: { in: made } } })) === 0, "the test removed the questions it made, and only those");
  }
}

live()
  .catch((error) => {
    console.error("FAIL: live ballot checks threw:", (error as Error).message.split("\n")[0]);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
