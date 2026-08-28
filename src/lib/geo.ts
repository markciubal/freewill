// Geography without surveillance. People choose a pin on a map when they join;
// it is rounded to about 100 m and is never shown to others as a point, only
// as a distance. Things people publish (needs, offers, commons, bulletins,
// circles) carry a copy of the pin and can be mapped, because publishing them
// is a choice. Nothing here calls a geocoder or asks a device for GPS.

export const NEAR_KM = 10;
export const PIN_DECIMALS = 3; // ~110 m at the equator

export type LatLng = { lat: number; lng: number };

export function roundPin(p: LatLng): LatLng {
  const f = 10 ** PIN_DECIMALS;
  return { lat: Math.round(p.lat * f) / f, lng: Math.round(p.lng * f) / f };
}

export function isValidLatLng(p: { lat: unknown; lng: unknown }): p is LatLng {
  return (
    typeof p.lat === "number" && typeof p.lng === "number" &&
    Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
    p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180
  );
}

export function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function fmtDistance(km: number | null | undefined) {
  if (km === null || km === undefined) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export type Scope = "local" | "near" | "all";

export function readScope(v: string | undefined): Scope {
  return v === "all" ? "all" : v === "near" ? "near" : "local";
}

// The database part of a scope: only "local" narrows the query. "near" is
// applied afterwards with `applyNear`, since the populations are small and
// Prisma has no geo operators for MongoDB.
export function scopeWhere(scope: Scope, locality: string) {
  return scope === "local" ? { locality } : {};
}

type Pinned = { lat: number | null; lng: number | null };

// Annotate items with distance from `me`, and when scope is "near" keep only
// those within NEAR_KM and sort nearest first. Items with no pin are kept in
// "local" and "all" (distance null) and dropped in "near".
export function applyNear<T extends Pinned>(items: T[], me: LatLng, scope: Scope): (T & { distanceKm: number | null })[] {
  const out = items.map((i) => ({
    ...i,
    distanceKm: i.lat !== null && i.lng !== null ? haversineKm(me, { lat: i.lat, lng: i.lng }) : null,
  }));
  if (scope !== "near") return out;
  return out.filter((i) => i.distanceKm !== null && i.distanceKm <= NEAR_KM).sort((a, b) => a.distanceKm! - b.distanceKm!);
}

export const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = "&copy; OpenStreetMap contributors";
