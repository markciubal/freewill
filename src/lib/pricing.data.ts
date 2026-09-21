import type { Category } from "@prisma/client";
import { CATEGORIES } from "./covenant";
import { db } from "./db";
import { localityKey } from "./form";
import { NEAR_KM, haversineKm, type LatLng } from "./geo";
import { REFERENCE_WINDOW_DAYS, categoryPulseFrom, referenceFrom, type CategoryPulse, type Reference } from "./pricing";

// What each category has recently settled for near one person. "Settled"
// means a transfer actually happened against a listing, so an asking price
// nobody paid never enters the figure. "Near" means the same locality (by
// name, ignoring capitalization) or within NEAR_KM of the viewer's rounded
// pin. Populations are small, so this filters in memory like the rest of the
// near-scope code.

export type ReferencePrices = Record<Category, { grace: Reference | null; hours: Reference | null }>;

type Viewer = LatLng & { locality: string };

export async function getReferencePrices(viewer: Viewer): Promise<ReferencePrices> {
  const since = new Date(Date.now() - REFERENCE_WINDOW_DAYS * 86_400_000);
  const settledTransfers = await db.transfer.findMany({
    where: { listingId: { not: null }, createdAt: { gte: since } },
    select: { ledger: true, amount: true, listing: { select: { category: true, locality: true, lat: true, lng: true } } },
  });

  const viewerLocality = localityKey(viewer.locality);
  const isNear = (listing: { locality: string | null; lat: number | null; lng: number | null }) => {
    if (listing.locality && localityKey(listing.locality) === viewerLocality) return true;
    if (listing.lat === null || listing.lng === null) return false;
    return haversineKm(viewer, { lat: listing.lat, lng: listing.lng }) <= NEAR_KM;
  };

  const amounts = new Map<string, number[]>(); // "WATER:GRACE" -> settled amounts
  for (const transfer of settledTransfers) {
    if (!transfer.listing || !isNear(transfer.listing)) continue;
    const key = `${transfer.listing.category}:${transfer.ledger}`;
    amounts.set(key, [...(amounts.get(key) ?? []), transfer.amount]);
  }

  return Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      {
        grace: referenceFrom(amounts.get(`${category}:GRACE`) ?? []),
        hours: referenceFrom(amounts.get(`${category}:HOURS`) ?? []),
      },
    ]),
  ) as ReferencePrices;
}

// The trade pulse by category, community-wide: how much better off people say
// an exchange left them, beside what that category usually settles for. Put
// together, these two columns are the water-diamond paradox in the
// community's own numbers: the categories that cost the least are often the
// ones people say helped the most. Categories with too few answers are left
// out so no single answer can be read back out of an average.
export async function getPulseByCategory(): Promise<CategoryPulse[]> {
  const since = new Date(Date.now() - REFERENCE_WINDOW_DAYS * 86_400_000);
  const [reflections, settledTransfers] = await Promise.all([
    db.reflection.findMany({ select: { delta: true, listing: { select: { category: true } } } }),
    db.transfer.findMany({
      where: { ledger: "GRACE", listingId: { not: null }, createdAt: { gte: since } },
      select: { amount: true, listing: { select: { category: true } } },
    }),
  ]);

  const deltasByCategory = new Map<Category, number[]>();
  for (const reflection of reflections) {
    const category = reflection.listing.category;
    deltasByCategory.set(category, [...(deltasByCategory.get(category) ?? []), reflection.delta]);
  }
  const graceByCategory = new Map<Category, number[]>();
  for (const transfer of settledTransfers) {
    if (!transfer.listing) continue;
    const category = transfer.listing.category;
    graceByCategory.set(category, [...(graceByCategory.get(category) ?? []), transfer.amount]);
  }

  return CATEGORIES.map((category) => categoryPulseFrom(category, deltasByCategory.get(category) ?? [], referenceFrom(graceByCategory.get(category) ?? [])))
    .filter((pulse): pulse is CategoryPulse => pulse !== null)
    .sort((a, b) => b.average - a.average);
}
