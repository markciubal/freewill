// Instant-runoff (ranked choice) tally. Each ballot is a list of option
// indices, most preferred first. Rounds continue until one option holds a
// majority of the ballots still expressing a preference.

export type Round = { counts: number[]; eliminated: number | null; active: number[] };
export type Tally = { rounds: Round[]; winner: number | null; ballots: number; exhausted: number };

export function tallyIRV(optionCount: number, ballots: number[][]): Tally {
  let active = Array.from({ length: optionCount }, (_, i) => i);
  const rounds: Round[] = [];
  const clean = ballots.map((b) => b.filter((i, k) => Number.isInteger(i) && i >= 0 && i < optionCount && b.indexOf(i) === k));

  for (let guard = 0; guard < optionCount + 1; guard++) {
    const counts = new Array<number>(optionCount).fill(0);
    let live = 0;
    for (const b of clean) {
      const pick = b.find((i) => active.includes(i));
      if (pick !== undefined) {
        counts[pick]++;
        live++;
      }
    }
    if (live === 0) {
      rounds.push({ counts, eliminated: null, active });
      return { rounds, winner: null, ballots: ballots.length, exhausted: ballots.length };
    }
    const leader = active.reduce((a, b) => (counts[b] > counts[a] ? b : a), active[0]);
    if (counts[leader] * 2 > live || active.length === 1) {
      rounds.push({ counts, eliminated: null, active });
      return { rounds, winner: leader, ballots: ballots.length, exhausted: ballots.length - live };
    }
    // Eliminate the lowest; break ties by fewest total mentions across all ballots.
    const mentions = (i: number) => clean.filter((b) => b.includes(i)).length;
    const loser = active.reduce((a, b) => {
      if (counts[b] !== counts[a]) return counts[b] < counts[a] ? b : a;
      return mentions(b) < mentions(a) ? b : a;
    }, active[0]);
    rounds.push({ counts, eliminated: loser, active });
    active = active.filter((i) => i !== loser);
  }
  return { rounds, winner: null, ballots: ballots.length, exhausted: 0 };
}
