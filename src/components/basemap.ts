"use client";

import type * as Leaflet from "leaflet";
import { PMTILES_ATTRIBUTION, PMTILES_URL, TILE_ATTRIBUTION, TILE_URL } from "@/lib/geo";
import { PLACE_CLASSES, ROAD_CLASSES, paletteFromTokens, type MapPalette } from "@/lib/map-theme";

// Adds the base map to a Leaflet map. With a self-hosted map file configured,
// the base map is drawn on the device from vector data, as outlines, in the
// person's theme colors. Without one, it falls back to raster tiles. Both
// maps in the app (the overview and the pin picker) call this, so they look
// the same and change together.

export async function addBasemap(L: typeof Leaflet, map: Leaflet.Map): Promise<void> {
  if (!PMTILES_URL) {
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    return;
  }
  const palette = paletteFromTokens((tokenName) => getComputedStyle(document.documentElement).getPropertyValue(`--${tokenName}`));
  const protomaps = await import("protomaps-leaflet");
  const layer = protomaps.leafletLayer({
    url: PMTILES_URL,
    attribution: PMTILES_ATTRIBUTION,
    backgroundColor: palette.land,
    paintRules: outlinePaintRules(protomaps, palette),
    labelRules: outlineLabelRules(protomaps, palette),
    maxDataZoom: 15,
    maxZoom: 19,
  });
  layer.addTo(map);
}

type Protomaps = typeof import("protomaps-leaflet");
type Feature = { props: Record<string, unknown>; geomType: number };

const text = (props: Record<string, unknown>, key: string) => (typeof props[key] === "string" ? (props[key] as string) : "");

// Drawing order is list order: ground first, then water, parks, buildings,
// roads on top, boundaries last. Each rule names a layer in the Protomaps
// basemap schema and how to draw it.
function outlinePaintRules(protomaps: Protomaps, palette: MapPalette) {
  const { PolygonSymbolizer, LineSymbolizer, GeomType, exp } = protomaps;
  const zoomWidth = (stops: readonly (readonly number[])[]) => (zoom: number) => exp(1.4, stops.map((s) => [...s]))(zoom);
  const parkKinds = new Set(["park", "forest", "wood", "nature_reserve", "cemetery", "golf_course", "grass", "garden", "allotments", "farmland", "orchard", "meadow", "recreation_ground", "protected_area"]);

  return [
    { dataLayer: "earth", symbolizer: new PolygonSymbolizer({ fill: palette.land }) },
    {
      dataLayer: "landuse",
      symbolizer: new PolygonSymbolizer({ fill: palette.park, opacity: 0.1 }),
      filter: (_zoom: number, feature: Feature) => parkKinds.has(text(feature.props, "kind")),
    },
    {
      dataLayer: "water",
      symbolizer: new PolygonSymbolizer({ fill: palette.water }),
      filter: (_zoom: number, feature: Feature) => feature.geomType === GeomType.Polygon,
    },
    {
      dataLayer: "water",
      symbolizer: new LineSymbolizer({ color: palette.water, width: zoomWidth([[10, 0.6], [14, 1.2], [18, 3]]) }),
      filter: (_zoom: number, feature: Feature) => feature.geomType === GeomType.Line,
    },
    // Buildings as outlines: a faint stroke in the border color, almost no fill.
    {
      dataLayer: "buildings",
      symbolizer: new PolygonSymbolizer({ fill: palette.building, opacity: 0.18, stroke: palette.building, width: 0.6 }),
    },
    // Roads, narrowest classes first so wide ones draw over them.
    ...[...ROAD_CLASSES].reverse().map((roadClass) => ({
      dataLayer: "roads",
      symbolizer: new LineSymbolizer({
        color: palette.road,
        width: zoomWidth(roadClass.widthStops),
        opacity: roadClass.kind === "path" || roadClass.kind === "other" ? 0.6 : 0.9,
        lineCap: "round" as CanvasLineCap,
        lineJoin: "round" as CanvasLineJoin,
        ...(roadClass.kind === "path" ? { dash: [2, 2] } : {}),
      }),
      filter: (_zoom: number, feature: Feature) => text(feature.props, "kind") === roadClass.kind,
    })),
    {
      dataLayer: "roads",
      symbolizer: new LineSymbolizer({ color: palette.boundary, width: 1, dash: [3, 3], opacity: 0.6 }),
      filter: (_zoom: number, feature: Feature) => text(feature.props, "kind") === "rail",
    },
    {
      dataLayer: "boundaries",
      symbolizer: new LineSymbolizer({ color: palette.boundary, width: 1, dash: [4, 3], opacity: 0.7 }),
    },
  ];
}

// Names: places in the page font and text color with a halo of land color so
// they stay legible over lines; street names along the roads, quieter.
function outlineLabelRules(protomaps: Protomaps, palette: MapPalette) {
  const { CenteredTextSymbolizer, LineLabelSymbolizer } = protomaps;
  return [
    ...PLACE_CLASSES.map((placeClass) => ({
      dataLayer: "places",
      minzoom: placeClass.minZoom,
      symbolizer: new CenteredTextSymbolizer({
        labelProps: ["name"],
        fill: palette.label,
        stroke: palette.labelHalo,
        width: 2,
        font: `${placeClass.fontWeight} ${placeClass.fontSize}px ${palette.fontFamily}`,
      }),
      filter: (_zoom: number, feature: Feature) => text(feature.props, "kind") === placeClass.kind,
    })),
    {
      dataLayer: "roads",
      minzoom: 14,
      symbolizer: new LineLabelSymbolizer({
        labelProps: ["name"],
        fill: palette.roadLabel,
        stroke: palette.labelHalo,
        width: 2,
        font: `400 11px ${palette.fontFamily}`,
      }),
      filter: (_zoom: number, feature: Feature) => ["highway", "major_road", "minor_road"].includes(text(feature.props, "kind")),
    },
  ];
}
