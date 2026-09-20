// How a person's theme becomes a map. When the community hosts its own map
// data (see docs/maps.md), the map is not a photograph of someone else's tiles
// but a drawing: land, water, roads as glowing or crisp lines, buildings as
// faint outlines, place names in the page's own font. Every color here comes
// from the theme's map tokens, so a person who picks a map preset or changes
// one color changes their map.
//
// When the map is picture tiles instead, the same theme supplies a CSS filter
// that pushes the pictures toward the chosen look.
//
// This file is pure so the mapping can be tested. The reader function is
// whatever can answer "what is --token right now": in the browser that is
// getComputedStyle on the document element; in a test it is a plain object.

import { DEFAULT_MAP_PRESET } from "./theme";

export type MapPalette = {
  land: string;
  water: string;
  road: string;
  building: string; // outline of buildings: the road color, drawn faintly
  boundary: string; // administrative lines: the road color, dashed and faint
  park: string; // parks and forests: the page accent, at low opacity
  label: string; // place names
  labelHalo: string; // a halo behind labels so they read over lines: the land color
  roadLabel: string; // street names: the label color, quieter
  glowPx: number; // extra width of the soft halo under roads and rivers; 0 for none
  tileFilter: string; // CSS filter for picture tiles
  fontFamily: string;
};

export type TokenReader = (tokenName: string) => string;

// Fall back to the default preset if a token cannot be read (a test, or a
// page where the theme style has not applied yet).
const FALLBACK: Record<string, string> = {
  "map-land": DEFAULT_MAP_PRESET.light["map-land"],
  "map-water": DEFAULT_MAP_PRESET.light["map-water"],
  "map-road": DEFAULT_MAP_PRESET.light["map-road"],
  "map-label": DEFAULT_MAP_PRESET.light["map-label"],
  "map-filter": DEFAULT_MAP_PRESET.light["map-filter"],
  "map-glow": DEFAULT_MAP_PRESET.glow,
  accent: "#3f6b3a",
  "font-sans": "system-ui, sans-serif",
};

function readOr(read: TokenReader, tokenName: string): string {
  const value = read(tokenName).trim();
  return value || FALLBACK[tokenName];
}

export function paletteFromTokens(read: TokenReader): MapPalette {
  const land = readOr(read, "map-land");
  const road = readOr(read, "map-road");
  const label = readOr(read, "map-label");
  return {
    land,
    water: readOr(read, "map-water"),
    road,
    building: road,
    boundary: road,
    park: readOr(read, "accent"),
    label,
    labelHalo: land,
    roadLabel: label,
    glowPx: pixels(readOr(read, "map-glow")),
    tileFilter: readOr(read, "map-filter"),
    // Canvas text cannot resolve var(--font-geist-sans), so any var() parts
    // of the stack are dropped and the first concrete family is used.
    fontFamily: concreteFontStack(readOr(read, "font-sans")),
  };
}

// "6px" -> 6; anything unreadable -> 0 (crisp lines).
export function pixels(length: string): number {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(length.trim());
  const value = match ? Number(match[1]) : 0;
  return Number.isFinite(value) && value > 0 ? Math.min(value, 24) : 0;
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
