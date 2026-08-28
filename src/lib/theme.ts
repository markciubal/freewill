// A theme is a small set of CSS custom properties. Each person keeps their own;
// there is no site-wide theme and nobody can set one for anyone else. Values
// are validated by kind before they are ever written into a <style> tag, so a
// saved theme can only ever contain colors, font stacks, and lengths.

export type TokenKind = "color" | "font" | "length";
export type Scheme = "system" | "light" | "dark";

export type TokenDef = {
  name: string;
  label: string;
  kind: TokenKind;
  hint: string;
  value?: string; // shared tokens (type, shape)
  light?: string; // color tokens
  dark?: string;
};

export const TOKENS: TokenDef[] = [
  { name: "font-sans", label: "Text font", kind: "font", hint: "Body and headings. A comma-separated stack; names with spaces in quotes.", value: "var(--font-geist-sans), system-ui, sans-serif" },
  { name: "font-mono", label: "Code font", kind: "font", hint: "Numbers in tables and the CSS editor.", value: "var(--font-geist-mono), ui-monospace, monospace" },
  { name: "font-size", label: "Base size", kind: "length", hint: "Everything scales from this. 14px is dense, 18px is easy on tired eyes.", value: "16px" },
  { name: "radius", label: "Corner radius", kind: "length", hint: "0 for square, 16px for soft.", value: "8px" },
  { name: "content-width", label: "Page width", kind: "length", hint: "Maximum width of the content column.", value: "64rem" },

  { name: "background", label: "Page", kind: "color", hint: "Behind everything.", light: "#f7f5ef", dark: "#14130f" },
  { name: "foreground", label: "Text", kind: "color", hint: "Main text.", light: "#1c1a17", dark: "#ebe7dc" },
  { name: "muted", label: "Quiet text", kind: "color", hint: "Hints, dates, secondary lines.", light: "#6b665c", dark: "#a39d8f" },
  { name: "card", label: "Card", kind: "color", hint: "Panels, header, tables.", light: "#ffffff", dark: "#1e1c17" },
  { name: "border", label: "Border", kind: "color", hint: "Lines between things.", light: "#e3ded2", dark: "#2f2c25" },
  { name: "accent", label: "Accent", kind: "color", hint: "Buttons, links, offers, good news.", light: "#3f6b3a", dark: "#7fb377" },
  { name: "accent-foreground", label: "Text on accent", kind: "color", hint: "Text on accent buttons.", light: "#ffffff", dark: "#0f1a0e" },
  { name: "danger", label: "Danger", kind: "color", hint: "Needs, urgent alerts, errors, harm.", light: "#a33a2a", dark: "#e0715f" },
  { name: "warn", label: "Warning", kind: "color", hint: "Hazards, matched listings, gathering circles.", light: "#b7791f", dark: "#e2b04a" },
];

export const SHARED_TOKENS = TOKENS.filter((t) => t.value !== undefined);
export const COLOR_TOKENS = TOKENS.filter((t) => t.kind === "color");
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
  light: Object.fromEntries(COLOR_TOKENS.map((t) => [t.name, t.light!])),
  dark: Object.fromEntries(COLOR_TOKENS.map((t) => [t.name, t.dark!])),
};

const COLOR_RE = /^(#[0-9a-f]{3,8}|(rgb|hsl|oklch|oklab|color)a?\([^()]{1,60}\)|[a-z]{3,24})$/i;
const LENGTH_RE = /^-?\d+(\.\d+)?(px|rem|em|%|ch|vw)$/;
const FONT_PART_RE = /^(var\(--[a-z0-9-]{1,40}\)|"[a-z0-9 \-]{1,40}"|'[a-z0-9 \-]{1,40}'|[a-z0-9\-]{1,40})$/i;

export function isValidValue(kind: TokenKind, v: string): boolean {
  const s = v.trim();
  if (!s || s.length > 200) return false;
  if (kind === "color") return COLOR_RE.test(s);
  if (kind === "length") return LENGTH_RE.test(s);
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
    light: pick(o.light, COLOR_TOKENS, t.light),
    dark: pick(o.dark, COLOR_TOKENS, t.dark),
  };
}

export function isDefaultTheme(theme: Theme) {
  return JSON.stringify(theme) === JSON.stringify(DEFAULT_THEME);
}
