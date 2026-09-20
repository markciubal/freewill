// How a person's theme becomes a map. When the community hosts its own map
// data (see docs/maps.md), the map is not a photograph of someone else's tiles
// but a drawing: land, water, roads as lines, buildings as faint outlines,
// place names in the page's own font. Every color here comes from the same
// theme tokens as the rest of the page, so a person who changes their colors
// changes their map too.
//
// This file is pure so the mapping can be tested. The reader function is
// whatever can answer "what is --token right now": in the browser that is
// getComputedStyle on the document element; in a test it is a plain object.

export type MapPalette = {
  land: string;
  water: string;
  road: string;
  building: string; // outline of buildings: the page's border color
  boundary: string; // administrative lines: quiet text color, dashed
  park: string; // parks and forests: the accent, at low opacity
  label: string; // place names: the page's text color
  labelHalo: string; // a halo behind labels so they read over lines: the land color
  roadLabel: string; // street names: quiet text
  fontFamily: string;
};

export type TokenReader = (tokenName: string) => string;

// Fall back to the light defaults if a token cannot be read (a test, or a
// page where the theme style has not applied yet).
const FALLBACK: Record<string, string> = {
  "map-land": "#efece4",
  "map-water": "#c8d8e4",
  "map-road": "#8c877c",
  border: "#e3ded2",
  muted: "#6b665c",
  accent: "#3f6b3a",
  foreground: "#1c1a17",
  "font-sans": "system-ui, sans-serif",
};

function readOr(read: TokenReader, tokenName: string): string {
  const value = read(tokenName).trim();
  return value || FALLBACK[tokenName];
}

export function paletteFromTokens(read: TokenReader): MapPalette {
  const land = readOr(read, "map-land");
  return {
    land,
    water: readOr(read, "map-water"),
    road: readOr(read, "map-road"),
    building: readOr(read, "border"),
    boundary: readOr(read, "muted"),
    park: readOr(read, "accent"),
    label: readOr(read, "foreground"),
    labelHalo: land,
    roadLabel: readOr(read, "muted"),
    // Canvas text cannot resolve var(--font-geist-sans), so any var() parts
    // of the stack are dropped and the first concrete family is used.
    fontFamily: concreteFontStack(readOr(read, "font-sans")),
  };
}

// "var(--font-geist-sans), system-ui, sans-serif" -> "system-ui, sans-serif".
// A var() the browser has already resolved (getComputedStyle does that) comes
// through as a real family name and is kept.
export function concreteFontStack(stack: string): string {
  const parts = stack
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith("var("));
  return parts.length ? parts.join(", ") : FALLBACK["font-sans"];
}

// The road classes the Protomaps basemap schema uses, from widest to narrowest,
// with the line width (in pixels) each gets at a few zoom levels. Widths grow
// with zoom so a highway stays a highway when you zoom out and a footpath does
// not vanish when you zoom in.
export const ROAD_CLASSES = [
  { kind: "highway", widthStops: [[6, 1], [12, 1.6], [15, 3.5], [18, 9]] },
  { kind: "major_road", widthStops: [[8, 0.6], [12, 1.2], [15, 2.2], [18, 6]] },
  { kind: "minor_road", widthStops: [[13, 0.5], [15, 1], [18, 3.5]] },
  { kind: "path", widthStops: [[14, 0.4], [18, 1.6]] },
  { kind: "other", widthStops: [[14, 0.4], [18, 1.6]] },
] as const;

// Which named places get a label and at what zoom they first appear.
export const PLACE_CLASSES = [
  { kind: "country", minZoom: 3, fontSize: 13, fontWeight: 600 },
  { kind: "region", minZoom: 5, fontSize: 12, fontWeight: 500 },
  { kind: "locality", minZoom: 8, fontSize: 12, fontWeight: 500 },
  { kind: "neighbourhood", minZoom: 13, fontSize: 11, fontWeight: 500 },
] as const;
