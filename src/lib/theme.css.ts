import { COLOR_TOKENS, SHARED_TOKENS, TOKENS, isValidValue, sanitizeTheme, type Theme } from "./theme";

// Serialize a theme to CSS and parse it back. The CSS shown in the editor is
// exactly the CSS that is applied, so what you see is what you edit. Sections
// are marked with comments; only `--name: value;` lines inside them are read.

const MARK = { shared: "/* @shared */", light: "/* @light */", darkSystem: "/* @dark-system */", dark: "/* @dark */" };

function decls(rec: Record<string, string>, names: string[], comments: boolean, indent: string) {
  return names
    .map((n) => {
      const def = TOKENS.find((t) => t.name === n)!;
      const c = comments ? ` /* ${def.label}. ${def.hint} */` : "";
      return `${indent}--${n}: ${rec[n]};${c}`;
    })
    .join("\n");
}

export function themeToCss(theme: Theme, comments = true): string {
  const shared = SHARED_TOKENS.map((t) => t.name);
  const colors = COLOR_TOKENS.map((t) => t.name);
  const head = comments
    ? `/* Freewill theme. This is yours alone; nobody can set it for you.
   Edit anything below and the page changes as you type. Save keeps it.
   Colors: hex, rgb(), hsl(), oklch(), or a CSS color name.
   Lengths: px, rem, em, %. Fonts: a comma-separated stack.
   Only "--name: value;" lines inside the marked sections are read.
   Scheme (system / light / dark) is chosen with the buttons above. */

`
    : "";
  return `${head}${MARK.shared}
:root {
${decls(theme.shared, shared, comments, "  ")}
}

${MARK.light}
:root {
${decls(theme.light, colors, comments, "  ")}
}

${MARK.darkSystem}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${decls(theme.dark, colors, false, "    ")}
  }
}

${MARK.dark}
:root[data-theme="dark"] {
${decls(theme.dark, colors, false, "  ")}
}
`;
}

// Parse CSS produced by themeToCss (or hand-edited). Unknown tokens are
// ignored; invalid values keep what `base` had. Comments are stripped first.
export function cssToTheme(css: string, base: Theme): Theme {
  const out: Theme = { scheme: base.scheme, shared: { ...base.shared }, light: { ...base.light }, dark: { ...base.dark } };
  const sections = css.split(/\/\*\s*@(shared|light|dark-system|dark)\s*\*\//);
  // sections: [preamble, name, body, name, body, ...]
  for (let i = 1; i < sections.length; i += 2) {
    const name = sections[i];
    const body = sections[i + 1].replace(/\/\*[\s\S]*?\*\//g, "");
    const target = name === "shared" ? out.shared : name === "light" ? out.light : out.dark;
    for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
      const def = TOKENS.find((t) => t.name === m[1]);
      if (!def) continue;
      const value = m[2].trim();
      if (!isValidValue(def.kind, value)) continue;
      if (def.value !== undefined) out.shared[def.name] = value;
      else if (name !== "shared") target[def.name] = value;
    }
  }
  return sanitizeTheme(out);
}
