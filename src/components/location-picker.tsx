"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILE_ATTRIBUTION, TILE_URL } from "@/lib/geo";

// A map you click to place one pin. No search box, no geocoder, no automatic
// GPS. The pin can also be typed in by hand, so this works with no map tiles.

export function LocationPicker({ initial, readOnly = false }: { initial?: { lat: number; lng: number }; readOnly?: boolean }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const marker = useRef<Leaflet.CircleMarker | null>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(initial ?? null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current || map.current) return;
      const m = L.map(mapRef.current, { worldCopyJump: true }).setView(initial ? [initial.lat, initial.lng] : [20, 0], initial ? 12 : 2);
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(m);
      const place = (lat: number, lng: number) => {
        if (!marker.current) {
          marker.current = L.circleMarker([lat, lng], { radius: 9, color: "#3f6b3a", fillColor: "#7fb377", fillOpacity: 0.9, weight: 2 }).addTo(m);
        } else marker.current.setLatLng([lat, lng]);
      };
      if (initial) place(initial.lat, initial.lng);
      if (!readOnly) {
        m.on("click", (e: Leaflet.LeafletMouseEvent) => {
          place(e.latlng.lat, e.latlng.lng);
          setPin({ lat: e.latlng.lat, lng: e.latlng.lng });
        });
      }
      map.current = m;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker in sync when the numbers are typed by hand.
  useEffect(() => {
    if (!map.current || !pin) return;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!map.current) return;
      if (!marker.current) marker.current = L.circleMarker([pin.lat, pin.lng], { radius: 9, color: "#3f6b3a", fillColor: "#7fb377", fillOpacity: 0.9, weight: 2 }).addTo(map.current);
      else marker.current.setLatLng([pin.lat, pin.lng]);
    })();
  }, [pin]);

  const useDevice = () => {
    if (!navigator.geolocation) return setStatus("This device offers no location.");
    setStatus("Asking the device...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPin(p);
        map.current?.setView([p.lat, p.lng], 13);
        setStatus("Placed from the device. Drag it off your door if you like.");
      },
      () => setStatus("The device would not say. Click the map instead."),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <div className="space-y-2">
      <div ref={mapRef} className="h-64 w-full rounded-md border border-border" aria-label="Map" />
      {!readOnly && (
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Latitude</span>
            <input name="lat" type="number" step="any" min={-90} max={90} required value={pin?.lat ?? ""} onChange={(e) => { const v = num(e.target.value); if (v !== null) setPin({ lat: v, lng: pin?.lng ?? 0 }); }} className="w-36 rounded-md border border-border bg-background px-2 py-1" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Longitude</span>
            <input name="lng" type="number" step="any" min={-180} max={180} required value={pin?.lng ?? ""} onChange={(e) => { const v = num(e.target.value); if (v !== null) setPin({ lat: pin?.lat ?? 0, lng: v }); }} className="w-36 rounded-md border border-border bg-background px-2 py-1" />
          </label>
          <button type="button" onClick={useDevice} className="rounded-md border border-border px-3 py-1 text-sm text-muted hover:text-foreground">
            Use device location (optional)
          </button>
          {status && <span className="text-xs text-muted">{status}</span>}
        </div>
      )}
    </div>
  );
}
