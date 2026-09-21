// A theme is a small set of CSS custom properties. Each person keeps their own;
// there is no site-wide theme and nobody can set one for anyone else. Values
// are validated by kind before they are ever written into a <style> tag, so a
// saved theme can only ever contain colors, font stacks, lengths, and a short
// list of image filter functions.

export type TokenKind = "color" | "font" | "length" | "filter";
export type Scheme = "system" | "light" | "dark";

export type TokenDef = {
  name: string;
  label: string;
  kind: TokenKind;
  hint: string;
  value?: string; // shared tokens (type, shape, depth): one value for both schemes
  light?: string; // scheme tokens: one value per scheme
  dark?: string;
};

// The map's look, as a named set. The default is Cypherpunk: a near-black
// ground with roads drawn as glowing cyan lines. "Paper" is the quiet printed
// look; "Blueprint" and "Phosphor" are two more. A person can pick one, then
// change any single color afterwards.
export type MapPreset = {
  key: string;
  label: string;
  hint: string;
  light: { "map-land": string; "map-water": string; "map-road": string; "map-label": string; "map-filter": string };
  dark: { "map-land": string; "map-water": string; "map-road": string; "map-label": string; "map-filter": string };
  glow: string;
};

// The raster fallback (picture tiles) cannot be recolored line by line, so
// each preset also carries a CSS filter that pushes the pictures toward the
// same look. Only these filter functions are allowed, with numeric arguments.
export const MAP_PRESETS: MapPreset[] = [
  {
    key: "cypherpunk",
    label: "Cypherpunk",
    hint: "Near-black ground, glowing cyan roads. The default.",
    light: { "map-land": "#07090d", "map-water": "#0b1c2c", "map-road": "#22d3ee", "map-label": "#d6f3fa", "map-filter": "invert(1) hue-rotate(180deg) brightness(0.8) contrast(1.15) saturate(1.6)" },
    dark: { "map-land": "#07090d", "map-water": "#0b1c2c", "map-road": "#22d3ee", "map-label": "#d6f3fa", "map-filter": "invert(1) hue-rotate(180deg) brightness(0.8) contrast(1.15) saturate(1.6)" },
    glow: "6px",
  },
  {
    key: "paper",
    label: "Paper",
    hint: "Quiet printed look that follows your page colors.",
    light: { "map-land": "#efece4", "map-water": "#c8d8e4", "map-road": "#8c877c", "map-label": "#1c1a17", "map-filter": "none" },
    dark: { "map-land": "#191813", "map-water": "#1d2833", "map-road": "#6f6a5f", "map-label": "#ebe7dc", "map-filter": "invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.95)" },
    glow: "0px",
  },
  {
    key: "blueprint",
    label: "Blueprint",
    hint: "White lines on deep blue, like a drawing.",
    light: { "map-land": "#0b2a5b", "map-water": "#08203f", "map-road": "#dbe8ff", "map-label": "#ffffff", "map-filter": "grayscale(1) invert(1) sepia(1) hue-rotate(190deg) saturate(4) brightness(0.55)" },
    dark: { "map-land": "#0b2a5b", "map-water": "#08203f", "map-road": "#dbe8ff", "map-label": "#ffffff", "map-filter": "grayscale(1) invert(1) sepia(1) hue-rotate(190deg) saturate(4) brightness(0.55)" },
    glow: "2px",
  },
  {
    key: "phosphor",
    label: "Phosphor",
    hint: "Green on black, an old terminal.",
    light: { "map-land": "#040704", "map-water": "#0a1f12", "map-road": "#3cff7a", "map-label": "#c8ffd9", "map-filter": "grayscale(1) invert(1) sepia(1) hue-rotate(80deg) saturate(3) brightness(0.6)" },
    dark: { "map-land": "#040704", "map-water": "#0a1f12", "map-road": "#3cff7a", "map-label": "#c8ffd9", "map-filter": "grayscale(1) invert(1) sepia(1) hue-rotate(80deg) saturate(3) brightness(0.6)" },
    glow: "5px",
  },
];

export const DEFAULT_MAP_PRESET = MAP_PRESETS[0];

export const TOKENS: TokenDef[] = [
  { name: "font-sans", label: "Text font", kind: "font", hint: "Body and headings. A comma-separated stack; names with spaces in quotes.", value: "var(--font-geist-sans), system-ui, sans-serif" },
  { name: "font-mono", label: "Code font", kind: "font", hint: "Numbers in tables and the CSS editor.", value: "var(--font-geist-mono), ui-monospace, monospace" },
  { name: "font-size", label: "Base size", kind: "length", hint: "Everything scales from this. 14px is dense, 18px is easy on tired eyes.", value: "16px" },
  { name: "radius", label: "Corner radius", kind: "length", hint: "0 for square, 16px for soft.", value: "10px" },
  { name: "content-width", label: "Page width", kind: "length", hint: "Maximum width of the content column.", value: "64rem" },
  { name: "elevation", label: "Depth", kind: "length", hint: "How much cards and buttons lift off the page. 0px is flat; 16px is a lot.", value: "10px" },
  { name: "map-glow", label: "Map glow", kind: "length", hint: "A soft halo under roads and rivers on a self-hosted map. 0px for crisp lines.", value: DEFAULT_MAP_PRESET.glow },

  { name: "background", label: "Page", kind: "color", hint: "Behind everything.", light: "#f7f5ef", dark: "#14130f" },
  { name: "foreground", label: "Text", kind: "color", hint: "Main text.", light: "#1c1a17", dark: "#ebe7dc" },
  { name: "muted", label: "Quiet text", kind: "color", hint: "Hints, dates, secondary lines.", light: "#6b665c", dark: "#a39d8f" },
  { name: "card", label: "Card", kind: "color", hint: "Panels, header, tables.", light: "#ffffff", dark: "#1e1c17" },
  { name: "border", label: "Border", kind: "color", hint: "Lines between things.", light: "#e3ded2", dark: "#2f2c25" },
  { name: "accent", label: "Accent", kind: "color", hint: "Buttons, links, offers, good news.", light: "#3f6b3a", dark: "#7fb377" },
  { name: "accent-foreground", label: "Text on accent", kind: "color", hint: "Text on accent buttons.", light: "#ffffff", dark: "#0f1a0e" },
  { name: "danger", label: "Danger", kind: "color", hint: "Needs, urgent alerts, errors, harm.", light: "#a33a2a", dark: "#e0715f" },
  { name: "warn", label: "Warning", kind: "color", hint: "Hazards, matched listings, gathering circles.", light: "#b7791f", dark: "#e2b04a" },

  // Map colors. On a self-hosted map (docs/maps.md) the map is drawn line by
  // line in these colors; on picture tiles, the filter below approximates them.
  { name: "map-land", label: "Map land", kind: "color", hint: "Ground on the map.", light: DEFAULT_MAP_PRESET.light["map-land"], dark: DEFAULT_MAP_PRESET.dark["map-land"] },
  { name: "map-water", label: "Map water", kind: "color", hint: "Rivers, lakes, sea.", light: DEFAULT_MAP_PRESET.light["map-water"], dark: DEFAULT_MAP_PRESET.dark["map-water"] },
  { name: "map-road", label: "Map roads", kind: "color", hint: "Roads and paths, drawn as lines. Buildings are faint outlines in this color.", light: DEFAULT_MAP_PRESET.light["map-road"], dark: DEFAULT_MAP_PRESET.dark["map-road"] },
  { name: "map-label", label: "Map names", kind: "color", hint: "Place and street names on the map.", light: DEFAULT_MAP_PRESET.light["map-label"], dark: DEFAULT_MAP_PRESET.dark["map-label"] },
  { name: "map-filter", label: "Map picture filter", kind: "filter", hint: "Applied to picture tiles when the map is not drawn from self-hosted data. Allowed: invert, hue-rotate, brightness, contrast, saturate, grayscale, sepia, or none.", light: DEFAULT_MAP_PRESET.light["map-filter"], dark: DEFAULT_MAP_PRESET.dark["map-filter"] },
];

export const SHARED_TOKENS = TOKENS.filter((t) => t.value !== undefined);
export const SCHEME_TOKENS = TOKENS.filter((t) => t.light !== undefined);
export const COLOR_TOKENS = TOKENS.filter((t) => t.kind === "color");
export const MAP_TOKEN_NAMES = ["map-land", "map-water", "map-road", "map-label", "map-filter"] as const;
export const SCHEMES: Scheme[] = ["system", "light", "dark"];

export type Theme = {
  scheme: Scheme;
  shared: Record<string, string>;
  light: Record<string, string>;
  dark: Record<string, string>;
};

export const DEFAULT_THEME: Theme = {
  scheme: "system",
  shared: Object.fromEntries(SHARED_TOKENS.map((t) => [t.name, t.value!])),
  light: Object.fromEntries(SCHEME_TOKENS.map((t) => [t.name, t.light!])),
  dark: Object.fromEntries(SCHEME_TOKENS.map((t) => [t.name, t.dark!])),
};

const COLOR_RE = /^(#[0-9a-f]{3,8}|(rgb|hsl|oklch|oklab|color)a?\([^()]{1,60}\)|[a-z]{3,24})$/i;
const LENGTH_RE = /^-?\d+(\.\d+)?(px|rem|em|%|ch|vw)$/;
const FONT_PART_RE = /^(var\(--[a-z0-9-]{1,40}\)|"[a-z0-9 \-]{1,40}"|'[a-z0-9 \-]{1,40}'|[a-z0-9\-]{1,40})$/i;
// One filter function with a plain numeric argument; a value is a run of them, or "none".
const FILTER_FN_RE = /^(invert|brightness|contrast|saturate|grayscale|sepia|opacity)\(\d+(\.\d+)?%?\)$|^hue-rotate\(-?\d+(\.\d+)?(deg|turn)?\)$/;

export function isValidValue(kind: TokenKind, v: string): boolean {
  const s = v.trim();
  if (!s || s.length > 200) return false;
  if (kind === "color") return COLOR_RE.test(s);
  if (kind === "length") return LENGTH_RE.test(s);
  if (kind === "filter") return s === "none" || s.split(/\s+/).every((part) => FILTER_FN_RE.test(part));
  return s.split(",").every((p) => FONT_PART_RE.test(p.trim()));
}

// Coerce anything (a DB JSON value, a form field, user CSS) into a valid Theme.
// Unknown tokens are dropped, invalid values fall back to the default.
export function sanitizeTheme(input: unknown): Theme {
  const t = DEFAULT_THEME;
  const o = (input && typeof input === "object" ? input : {}) as Partial<Record<keyof Theme, unknown>>;
  const pick = (src: unknown, defs: TokenDef[], fallback: Record<string, string>) => {
    const rec = (src && typeof src === "object" ? src : {}) as Record<string, unknown>;
    return Object.fromEntries(
      defs.map((d) => {
        const v = rec[d.name];
        return [d.name, typeof v === "string" && isValidValue(d.kind, v) ? v.trim() : fallback[d.name]];
      }),
    );
  };
  return {
    scheme: SCHEMES.includes(o.scheme as Scheme) ? (o.scheme as Scheme) : "system",
    shared: pick(o.shared, SHARED_TOKENS, t.shared),
    light: pick(o.light, SCHEME_TOKENS, t.light),
    dark: pick(o.dark, SCHEME_TOKENS, t.dark),
  };
}

// The theme with one map preset applied to both schemes. Everything else in
// the theme is left as it was.
export function applyMapPreset(theme: Theme, preset: MapPreset): Theme {
  return {
    ...theme,
    shared: { ...theme.shared, "map-glow": preset.glow },
    light: { ...theme.light, ...preset.light },
    dark: { ...theme.dark, ...preset.dark },
  };
}

// Which preset a theme's map currently matches, if any.
export function matchingMapPreset(theme: Theme): MapPreset | null {
  return (
    MAP_PRESETS.find(
      (preset) =>
        theme.shared["map-glow"] === preset.glow &&
        MAP_TOKEN_NAMES.every((name) => theme.light[name] === preset.light[name] && theme.dark[name] === preset.dark[name]),
    ) ?? null
  );
}

export function isDefaultTheme(theme: Theme) {
  return JSON.stringify(theme) === JSON.stringify(DEFAULT_THEME);
}
