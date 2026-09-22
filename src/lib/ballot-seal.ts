import { sha256 } from "@noble/hashes/sha2.js";

// Secret ballots: the rules both the browser and the server follow. Pure, with
// no database, so the voter's browser and the server compute the same thing
// from the same code.
//
// How a ballot stays secret:
//   1. Your browser makes a random secret (the ballot key) and keeps it.
//   2. It sends your ranking with only the fingerprint of that key.
//   3. The server writes two unrelated things: on the voter roll, that you
//      voted; inside the question, a sealed ballot holding the ranking and
//      the fingerprint, with no name and no time. The sealed ballots are
//      shuffled every time one is added or changed, so their order says
//      nothing about who voted when.
//   4. To change your ballot you show the key itself. Its fingerprint finds
//      your sealed ballot, and nobody who only reads the database can do the
//      same, because a fingerprint cannot be turned back into its key.
//
// What this does not hide: the server handles each request while you are
// signed in, so an operator who logged requests as they arrived could still
// see which ballot you cast. It protects the stored record, which is what a
// seized database or a later look through it would find.

export const BALLOT_KEY_BYTES = 32;

const HEX_64 = /^[0-9a-f]{64}$/;

export function isBallotKey(value: string): boolean {
  return HEX_64.test(value);
}

export function isBallotFingerprint(value: string): boolean {
  return HEX_64.test(value);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// The fingerprint stored beside a sealed ballot. The prefix keeps a ballot
// key from ever doubling as anything else hashed in this app.
export function ballotFingerprint(ballotKey: string): string {
  return hex(sha256(new TextEncoder().encode(`freewill-ballot:${ballotKey.trim().toLowerCase()}`)));
}

// A fresh ballot key from the device's own randomness.
export function newBallotKey(): string {
  const bytes = new Uint8Array(BALLOT_KEY_BYTES);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

// A fair shuffle (Fisher-Yates) with the platform's cryptographic randomness,
// so the order of sealed ballots cannot be predicted or replayed.
export function shuffled<T>(items: readonly T[], randomBelow: (limit: number) => number = cryptoRandomBelow): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cryptoRandomBelow(limit: number): number {
  // Rejection sampling keeps every index equally likely.
  const ceiling = Math.floor(0x1_0000_0000 / limit) * limit;
  const word = new Uint32Array(1);
  do crypto.getRandomValues(word);
  while (word[0] >= ceiling);
  return word[0] % limit;
}

// A ranking as the form sends it: rank_<i> = 1..n for option i, blank to
// leave an option unranked. Returns option indices, first choice first, or
// the reason it cannot be read.
export function readRanking(optionCount: number, rankFor: (option: number) => string | null | undefined): { ranking: number[] } | { error: string } {
  const ranked: { option: number; rank: number }[] = [];
  for (let option = 0; option < optionCount; option++) {
    const raw = rankFor(option)?.trim();
    if (!raw) continue;
    const rank = Number(raw);
    if (!Number.isInteger(rank) || rank < 1 || rank > optionCount) return { error: "Ranks must be whole numbers." };
    ranked.push({ option, rank });
  }
  if (ranked.length === 0) return { error: "Rank at least one option." };
  if (new Set(ranked.map((entry) => entry.rank)).size !== ranked.length) return { error: "Each rank can be used once." };
  return { ranking: ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.option) };
}
