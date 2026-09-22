import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import { arrivedHereByOnion } from "./onion.server";
import { ONION_ADDRESS_KEY, RATE_LIMITS, rateLimitAllows, type RateLimit } from "./security";

// Counting attempts in the database rather than in memory, because on a
// serverless host every request may land on a fresh process. The rows are
// small, short-lived, and never part of the ledger.

type AttemptKind = "login" | "join" | "ingest";

// The address the request came from, as the platform reports it. Behind a
// proxy or a serverless host the real address is the first entry of
// x-forwarded-for. When nothing is known, every unknown caller shares one
// bucket, which is strict rather than lenient. Visits through the onion
// service have no address by design; they share the onion bucket, which has
// its own limits (ONION_RATE_LIMITS, read through addressLimit).
export async function clientAddressKey(): Promise<string> {
  if (await arrivedHereByOnion()) return ONION_ADDRESS_KEY;
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const firstHop = forwardedFor?.split(",")[0]?.trim();
  const address = firstHop || requestHeaders.get("x-real-ip") || "unknown";
  return `ip:${address}`;
}

export function usernameKey(username: string): string {
  return `user:${username.toLowerCase()}`;
}

// How many attempts this key has made inside the limit's window.
async function attemptsInWindow(kind: AttemptKind, key: string, limit: RateLimit): Promise<number> {
  const windowStart = new Date(Date.now() - limit.windowMinutes * 60_000);
  return db.authAttempt.count({ where: { kind, key, createdAt: { gte: windowStart } } });
}

// True when one more attempt may proceed for every (key, limit) pair given.
export async function rateLimitPermits(kind: AttemptKind, checks: { key: string; limit: RateLimit }[]): Promise<{ allowed: true } | { allowed: false; limit: RateLimit }> {
  for (const check of checks) {
    const count = await attemptsInWindow(kind, check.key, check.limit);
    if (!rateLimitAllows(count, check.limit)) return { allowed: false, limit: check.limit };
  }
  return { allowed: true };
}

// Record an attempt against each key, and now and then sweep rows older than
// a day so the collection never grows. The sweep is a plain cleanup of
// throttling data, not a ledger deletion.
export async function recordAttempt(kind: AttemptKind, keys: string[]): Promise<void> {
  await db.authAttempt.createMany({ data: keys.map((key) => ({ kind, key })) });
  if (Math.random() < 0.05) {
    const aDayAgo = new Date(Date.now() - 24 * 60 * 60_000);
    await db.authAttempt.deleteMany({ where: { createdAt: { lt: aDayAgo } } });
  }
}

export { RATE_LIMITS };
