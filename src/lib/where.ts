import type { Prisma } from "@prisma/client";

// Filters that have to cope with a MongoDB quirk: a field that was never
// written is not the same as a field holding null, and a filter for null
// matches only the second. Prisma leaves an optional field out of the document
// when it is created empty, so "has no expiry" must ask for both, or a notice
// with no expiry is never shown to anyone.

// A notice that is still current: one with no expiry, or one not yet expired.
export function stillCurrent(now = new Date()): Prisma.BulletinWhereInput {
  return { OR: [{ expiresAt: null }, { expiresAt: { isSet: false } }, { expiresAt: { gt: now } }] };
}

// A notice posted to everywhere rather than to one locality.
export const postedEverywhere: Prisma.BulletinWhereInput[] = [{ locality: null }, { locality: { isSet: false } }];
