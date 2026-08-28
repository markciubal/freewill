import { MapView, type MapPoint } from "@/components/map-view";
import { PageTitle, ScopeToggle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CATEGORY_LABEL } from "@/lib/covenant";
import { db } from "@/lib/db";
import { readScope, scopeWhere } from "@/lib/form";
import { applyNear, fmtDistance } from "@/lib/geo";

const HAZARD_RADIUS_M = { INFO: 0, HAZARD: 1000, URGENT: 3000 } as const;

export default async function MapPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const scope = readScope(sp.scope ?? "near");
  const now = new Date();
  const [listings, commons, bulletins, circles] = await Promise.all([
    db.listing.findMany({ where: { status: { in: ["OPEN", "MATCHED"] }, lat: { not: null }, ...scopeWhere(scope, me.locality) }, take: 300, include: { owner: { select: { username: true } } } }),
    db.commons.findMany({ where: { lat: { not: null }, ...scopeWhere(scope, me.locality) }, take: 300 }),
    db.bulletin.findMany({ where: { lat: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], ...scopeWhere(scope, me.locality) }, take: 300 }),
    db.circle.findMany({ where: { lat: { not: null }, status: { in: ["OPEN", "GATHERING"] }, ...scopeWhere(scope, me.locality) }, take: 100 }),
  ]);

  const points: MapPoint[] = [
    ...applyNear(listings, me, scope).map((l) => ({
      id: l.id, lat: l.lat!, lng: l.lng!, kind: l.kind === "NEED" ? ("need" as const) : ("offer" as const),
      label: `${l.kind === "NEED" ? "Need" : "Offer"}: ${l.title}`, detail: `${CATEGORY_LABEL[l.category]} / @${l.owner.username} / ${fmtDistance(l.distanceKm)} away`, href: `/board/${l.id}`,
    })),
    ...applyNear(commons, me, scope).map((c) => ({
      id: c.id, lat: c.lat!, lng: c.lng!, kind: "commons" as const, label: c.name, detail: `${CATEGORY_LABEL[c.category]} / ${c.available ? "available" : "unavailable"} / ${fmtDistance(c.distanceKm)} away`, href: "/commons",
    })),
    ...applyNear(bulletins, me, scope).map((b) => ({
      id: b.id, lat: b.lat!, lng: b.lng!, kind: b.level.toLowerCase() as "info" | "hazard" | "urgent", label: b.title, detail: `${b.level} / ${fmtDistance(b.distanceKm)} away`, href: "/bulletins",
      radiusM: HAZARD_RADIUS_M[b.level] || undefined,
    })),
    ...applyNear(circles, me, scope).map((c) => ({
      id: c.id, lat: c.lat!, lng: c.lng!, kind: "circle" as const, label: `Circle: ${c.title}`, detail: `${c.status} / ${fmtDistance(c.distanceKm)} away`, href: `/circles/${c.id}`,
    })),
  ];

  return (
    <div className="space-y-4">
      <PageTitle
        title="Map"
        subtitle="Needs, offers, commons, hazards and open circles around you. People are never drawn on this map; the dashed ring is roughly where you are. Pins are rounded to about a hundred meters."
        action={<ScopeToggle scope={scope} base="/map" locality={me.locality} />}
      />
      <div className="flex flex-wrap gap-3 text-xs text-muted">
        <span><span className="inline-block h-3 w-3 rounded-full bg-[#e0715f] align-middle" /> need / urgent</span>
        <span><span className="inline-block h-3 w-3 rounded-full bg-[#7fb377] align-middle" /> offer</span>
        <span><span className="inline-block h-3 w-3 rounded-full bg-[#6fa3d6] align-middle" /> commons</span>
        <span><span className="inline-block h-3 w-3 rounded-full bg-[#e2b04a] align-middle" /> hazard</span>
        <span><span className="inline-block h-3 w-3 rounded-full bg-[#a78bd6] align-middle" /> circle</span>
        <span>{points.length} things shown</span>
      </div>
      <MapView center={{ lat: me.lat, lng: me.lng }} points={points} zoom={scope === "all" ? 6 : 12} />
      <p className="text-xs text-muted">Map tiles come from OpenStreetMap over the internet. Set NEXT_PUBLIC_TILE_URL to a local tile server when the network is gone.</p>
    </div>
  );
}
