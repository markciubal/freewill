"use client";

import type * as Leaflet from "leaflet";
import { PMTILES_ATTRIBUTION, PMTILES_URL, TILE_ATTRIBUTION, TILE_URL } from "@/lib/geo";
import { PLACE_CLASSES, ROAD_CLASSES, paletteFromTokens, type MapPalette } from "@/lib/map-theme";

// Adds the base map to a Leaflet map. With a self-hosted map file configured,
// the base map is drawn on the device from vector data, as lines, in the
// person's map colors, with an optional glow. Without one, it falls back to
// picture tiles with the theme's filter applied so they lean the same way.
// Both maps in the app (the overview and the pin picker) call this, so they
// look the same and change together.

export function readPalette(): MapPalette {
  return paletteFromTokens((tokenName) => getComputedStyle(document.documentElement).getPropertyValue(`--${tokenName}`));
}

export async function addBasemap(L: typeof Leaflet, map: Leaflet.Map): Promise<void> {
  const palette = readPalette();
  const container = map.getContainer();
  container.style.background = palette.land;

  if (!PMTILES_URL) {
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    const tilePane = map.getPane("tilePane");
    if (tilePane) tilePane.style.filter = palette.tileFilter === "none" ? "" : palette.tileFilter;
    return;
  }

  const protomaps = await import("protomaps-leaflet");
  const layer = protomaps.leafletLayer({
    url: PMTILES_URL,
    attribution: PMTILES_ATTRIBUTION,
    backgroundColor: palette.land,
    paintRules: linePaintRules(protomaps, palette),
    labelRules: lineLabelRules(protomaps, palette),
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
// basemap schema and how to draw it. A glow is the same line drawn first,
// wider and faint, under the crisp one.
function linePaintRules(protomaps: Protomaps, palette: MapPalette) {
  const { PolygonSymbolizer, LineSymbolizer, GeomType, exp } = protomaps;
  const zoomWidth = (stops: readonly (readonly number[])[], extra = 0) => (zoom: number) => exp(1.4, stops.map((s) => [...s]))(zoom) + extra;
  const parkKinds = new Set(["park", "forest", "wood", "nature_reserve", "cemetery", "golf_course", "grass", "garden", "allotments", "farmland", "orchard", "meadow", "recreation_ground", "protected_area"]);
  const glow = palette.glowPx;

  const roadRules = [...ROAD_CLASSES].reverse().flatMap((roadClass) => {
    const isPath = roadClass.kind === "path" || roadClass.kind === "other";
    const filter = (_zoom: number, feature: Feature) => text(feature.props, "kind") === roadClass.kind;
    const halo = glow > 0 && !isPath
      ? [{ dataLayer: "roads", symbolizer: new LineSymbolizer({ color: palette.road, width: zoomWidth(roadClass.widthStops, glow), opacity: 0.18, lineCap: "round" as CanvasLineCap, lineJoin: "round" as CanvasLineJoin }), filter }]
      : [];
    const line = {
      dataLayer: "roads",
      symbolizer: new LineSymbolizer({
        color: palette.road,
        width: zoomWidth(roadClass.widthStops),
        opacity: isPath ? 0.55 : 0.95,
        lineCap: "round" as CanvasLineCap,
        lineJoin: "round" as CanvasLineJoin,
        ...(roadClass.kind === "path" ? { dash: [2, 2] } : {}),
      }),
      filter,
    };
    return [...halo, line];
  });

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
    ...(glow > 0
      ? [{ dataLayer: "water", symbolizer: new LineSymbolizer({ color: palette.water, width: zoomWidth([[10, 0.6], [14, 1.2], [18, 3]], glow), opacity: 0.35 }), filter: (_zoom: number, feature: Feature) => feature.geomType === GeomType.Line }]
      : []),
    {
      dataLayer: "water",
      symbolizer: new LineSymbolizer({ color: palette.water, width: zoomWidth([[10, 0.6], [14, 1.2], [18, 3]]) }),
      filter: (_zoom: number, feature: Feature) => feature.geomType === GeomType.Line,
    },
    // Buildings as faint outlines in the road color.
    {
      dataLayer: "buildings",
      symbolizer: new PolygonSymbolizer({ fill: palette.building, opacity: 0.1, stroke: palette.building, width: 0.5 }),
    },
    ...roadRules,
    {
      dataLayer: "roads",
      symbolizer: new LineSymbolizer({ color: palette.boundary, width: 1, dash: [3, 3], opacity: 0.45 }),
      filter: (_zoom: number, feature: Feature) => text(feature.props, "kind") === "rail",
    },
    {
      dataLayer: "boundaries",
      symbolizer: new LineSymbolizer({ color: palette.boundary, width: 1, dash: [4, 3], opacity: 0.5 }),
    },
  ];
}

// Names: places in the page font and the map's label color with a halo of
// land color so they stay legible over lines; street names along the roads.
function lineLabelRules(protomaps: Protomaps, palette: MapPalette) {
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
