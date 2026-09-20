import type { Category, ListingKind } from "@prisma/client";
import { db } from "./db";
import { NEAR_KM, haversineKm, type LatLng } from "./geo";

// Match finding for the board: the double-coincidence problem, worked from
// both ends. Grace and Hours exist so trades do not need to coincide; this
// module finds the coincidences that exist anyway. Two shapes:
//   - counterpart: someone nearby has an OFFER in the category of your NEED
//     (or the reverse).
//   - reciprocal: you offer what they need AND they offer what you need, so
//     the two of you can trade directly with no credit involved.
// Pure logic lives in computeMatches so it can be tested without a database.

export type OpenListing = {
  id: string;
  kind: ListingKind;
  category: Category;
  title: string;
  ownerId: string;
  locality: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: Date;
  owner: { username: string };
};

export type Counterpart = { mine: OpenListing; theirs: OpenListing; distanceKm: number | null };
export type Reciprocal = {
  other: { id: string; username: string };
  myOffer: OpenListing;
  theirNeed: OpenListing;
  myNeed: OpenListing;
  theirOffer: OpenListing;
  distanceKm: number | null;
};

export type Matches = { counterparts: Counterpart[]; reciprocals: Reciprocal[]; total: number };

const PER_LISTING = 4;

function distanceTo(me: LatLng, l: OpenListing) {
  return l.lat !== null && l.lng !== null ? haversineKm(me, { lat: l.lat, lng: l.lng }) : null;
}

// A listing is in reach when it shares the viewer's locality or sits within
// NEAR_KM. Unpinned listings count only via locality.
function inReach(me: LatLng & { locality: string }, l: OpenListing, d: number | null) {
  return l.locality === me.locality || (d !== null && d <= NEAR_KM);
}

export function computeMatches(mine: OpenListing[], others: OpenListing[], me: LatLng & { locality: string }): Matches {
  const reachable = others
    .map((l) => ({ l, d: distanceTo(me, l) }))
    .filter(({ l, d }) => inReach(me, l, d));

  const counterparts: Counterpart[] = [];
  for (const m of mine) {
    const found = reachable
      .filter(({ l }) => l.kind !== m.kind && l.category === m.category)
      .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity) || b.l.createdAt.getTime() - a.l.createdAt.getTime())
      .slice(0, PER_LISTING);
    for (const { l, d } of found) counterparts.push({ mine: m, theirs: l, distanceKm: d });
  }

  // Reciprocals: group the reachable listings by owner, then look for a pair of
  // categories traded in opposite directions between me and that owner.
  const byOwner = new Map<string, { username: string; offers: OpenListing[]; needs: OpenListing[]; d: number | null }>();
  for (const { l, d } of reachable) {
    const o = byOwner.get(l.ownerId) ?? { username: l.owner.username, offers: [], needs: [], d };
    (l.kind === "OFFER" ? o.offers : o.needs).push(l);
    o.d = o.d === null ? d : d === null ? o.d : Math.min(o.d, d);
    byOwner.set(l.ownerId, o);
  }
  const myOffers = mine.filter((l) => l.kind === "OFFER");
  const myNeeds = mine.filter((l) => l.kind === "NEED");

  const reciprocals: Reciprocal[] = [];
  for (const [ownerId, o] of byOwner) {
    let best: Reciprocal | null = null;
    for (const myOffer of myOffers) {
      const theirNeed = o.needs.find((n) => n.category === myOffer.category);
      if (!theirNeed) continue;
      for (const myNeed of myNeeds) {
        const theirOffer = o.offers.find((f) => f.category === myNeed.category);
        if (!theirOffer) continue;
        best = { other: { id: ownerId, username: o.username }, myOffer, theirNeed, myNeed, theirOffer, distanceKm: o.d };
        break;
      }
      if (best) break;
    }
    if (best) reciprocals.push(best);
  }
  reciprocals.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

  return { counterparts, reciprocals, total: counterparts.length + reciprocals.length };
}

const listingSelect = {
  id: true, kind: true, category: true, title: true, ownerId: true,
  locality: true, lat: true, lng: true, createdAt: true,
  owner: { select: { username: true } },
} as const;

export async function findMatchesForUser(me: { id: string; lat: number; lng: number; locality: string }): Promise<Matches> {
  const mine = await db.listing.findMany({ where: { ownerId: me.id, status: "OPEN" }, select: listingSelect });
  if (mine.length === 0) return { counterparts: [], reciprocals: [], total: 0 };
  const others = await db.listing.findMany({
    where: { status: "OPEN", ownerId: { not: me.id } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: listingSelect,
  });
  return computeMatches(mine, others, me);
}
