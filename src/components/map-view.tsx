"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILE_ATTRIBUTION, TILE_URL } from "@/lib/geo";

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  kind: "need" | "offer" | "commons" | "info" | "hazard" | "urgent" | "circle";
  label: string;
  detail?: string;
  href?: string;
  radiusM?: number; // draw a circle (hazards)
};

const STYLE: Record<MapPoint["kind"], { color: string; fill: string }> = {
  need: { color: "#a33a2a", fill: "#e0715f" },
  offer: { color: "#3f6b3a", fill: "#7fb377" },
  commons: { color: "#2b5d8a", fill: "#6fa3d6" },
  info: { color: "#6b665c", fill: "#a39d8f" },
  hazard: { color: "#b7791f", fill: "#e2b04a" },
  urgent: { color: "#a33a2a", fill: "#e0715f" },
  circle: { color: "#6b3fa0", fill: "#a78bd6" },
};

// People are never drawn here. Only things people chose to publish.
export function MapView({ center, points, zoom = 12, height = "h-[70vh]" }: { center: { lat: number; lng: number }; points: MapPoint[]; zoom?: number; height?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || map.current) return;
      const m = L.map(ref.current).setView([center.lat, center.lng], zoom);
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(m);
      // "You are about here": a soft ring, not a pin, at the viewer's rounded location.
      L.circle([center.lat, center.lng], { radius: 150, color: "#3f6b3a", weight: 1, fillOpacity: 0.08, dashArray: "4 4" }).addTo(m);
      for (const p of points) {
        const s = STYLE[p.kind];
        const html = `<div style="min-width:160px"><strong>${esc(p.label)}</strong>${p.detail ? `<br/><span style="opacity:.75">${esc(p.detail)}</span>` : ""}${p.href ? `<br/><a href="${p.href}">Open</a>` : ""}</div>`;
        if (p.radiusM) {
          L.circle([p.lat, p.lng], { radius: p.radiusM, color: s.color, fillColor: s.fill, fillOpacity: 0.15, weight: 1.5 }).addTo(m).bindPopup(html);
        }
        L.circleMarker([p.lat, p.lng], { radius: 8, color: s.color, fillColor: s.fill, fillOpacity: 0.9, weight: 2 }).addTo(m).bindPopup(html);
      }
      map.current = m;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className={`w-full rounded-lg border border-border ${height}`} aria-label="Map" />;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
