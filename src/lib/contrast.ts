// Is text readable against what it sits on? The WCAG contrast ratio, from 1
// (no difference) to 21 (black on white). 4.5 to 1 is the usual minimum for
// ordinary text, and most text here is small. Pure, so the theme editor can
// warn as someone picks colors and smoke:a11y can hold the built-in look to it.
//
// A person's theme is theirs alone (see theme.ts), so a warning never blocks
// saving: it tells them what will be hard to read and lets them decide.

export const MIN_TEXT_CONTRAST = 4.5;

export type RGB = [number, number, number];

// Hex (#rgb, #rgba, #rrggbb, #rrggbbaa) and rgb()/rgba() with plain numbers.
// Anything else (hsl, oklch, a color name) returns null here; the theme editor
// resolves those in the browser, which knows every CSS color.
export function parseColor(value: string): RGB | null {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(v)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const full = hex.length <= 4 ? [...hex.slice(0, 3)].map((c) => c + c).join("") : hex.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
  }
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*([,/]\s*[\d.]+%?\s*)?\)$/.exec(v);
  if (rgb) {
    const parts = [rgb[1], rgb[2], rgb[3]].map(Number);
    return parts.every((n) => n <= 255) ? (parts as RGB) : null;
  }
  return null;
}

function luminance([r, g, b]: RGB): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// A color laid over another at some opacity, as a tinted badge background is
// (bg-danger/10 is danger at 10% over the card).
export function blend(top: RGB, under: RGB, alpha: number): RGB {
  return top.map((c, i) => Math.round(c * alpha + under[i] * (1 - alpha))) as RGB;
}

// The places text meets a background in this app, by token. `tint` is a
// background made of the text's own color at that opacity over `on`, as the
// badges and the messages after a form are.
export type TextPair = { text: string; on: string; tint?: number; where: string };
export const TEXT_PAIRS: TextPair[] = [
  { text: "foreground", on: "background", where: "Text on the page" },
  { text: "foreground", on: "card", where: "Text on cards" },
  { text: "muted", on: "background", where: "Quiet text on the page" },
  { text: "muted", on: "card", where: "Quiet text on cards" },
  { text: "accent", on: "background", where: "Links on the page" },
  { text: "accent", on: "card", where: "Links on cards" },
  { text: "accent-foreground", on: "accent", where: "Words on buttons" },
  { text: "accent", on: "background", tint: 0.1, where: "Messages that something worked" },
  { text: "accent", on: "card", tint: 0.1, where: "Offer and good-news labels" },
  { text: "danger", on: "card", where: "Errors and needs on cards" },
  { text: "danger", on: "background", tint: 0.1, where: "Messages that something went wrong" },
  { text: "danger", on: "card", tint: 0.1, where: "Need and urgent labels" },
  { text: "warn", on: "card", where: "Warnings on cards" },
  { text: "warn", on: "card", tint: 0.1, where: "Hazard and matched labels" },
];

export type ContrastProblem = TextPair & { ratio: number };

// Every place in one scheme's colors where text would fall below the minimum.
// A color that cannot be resolved is skipped rather than guessed.
export function contrastProblems(colors: Record<string, string>, resolve: (value: string) => RGB | null = parseColor): ContrastProblem[] {
  const problems: ContrastProblem[] = [];
  for (const pair of TEXT_PAIRS) {
    const text = colors[pair.text] ? resolve(colors[pair.text]) : null;
    const under = colors[pair.on] ? resolve(colors[pair.on]) : null;
    if (!text || !under) continue;
    const background = pair.tint ? blend(text, under, pair.tint) : under;
    const ratio = contrastRatio(text, background);
    if (ratio < MIN_TEXT_CONTRAST) problems.push({ ...pair, ratio });
  }
  return problems;
}

// "3.3 to 1", rounded down so a ratio of 4.49 never reads as 4.5.
export function fmtRatio(ratio: number): string {
  return `${Math.floor(ratio * 10) / 10} to 1`;
}
