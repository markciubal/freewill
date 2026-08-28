// Theme serialization round-trips, and bad input is rejected. Run: npm run smoke:theme
import { DEFAULT_THEME, isValidValue, sanitizeTheme } from "../src/lib/theme";
import { cssToTheme, themeToCss } from "../src/lib/theme.css";

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else console.log("ok:", msg);
}

const css = themeToCss(DEFAULT_THEME);
assert(JSON.stringify(cssToTheme(css, DEFAULT_THEME)) === JSON.stringify(DEFAULT_THEME), "default theme round-trips through CSS");

const edited = css.replace("--accent: #3f6b3a;", "--accent: #aa2266;").replace("--radius: 8px;", "--radius: 0px;");
const t = cssToTheme(edited, DEFAULT_THEME);
assert(t.light.accent === "#aa2266" && t.dark.accent === DEFAULT_THEME.dark.accent, "editing a light color changes only light");
assert(t.shared.radius === "0px", "shared token edited from CSS");

const darkEdited = css.replace(/\/\* @dark \*\/[\s\S]*$/, `/* @dark */\n:root[data-theme="dark"] {\n  --background: hsl(20 10% 8%);\n}\n`);
assert(cssToTheme(darkEdited, DEFAULT_THEME).dark.background === "hsl(20 10% 8%)", "dark block parsed, hsl accepted");

const hostile = css.replace("--accent: #3f6b3a;", '--accent: url("https://evil/x");').replace("--font-sans: var(--font-geist-sans), system-ui, sans-serif;", "--font-sans: expression(alert(1));");
const h = cssToTheme(hostile, DEFAULT_THEME);
assert(h.light.accent === DEFAULT_THEME.light.accent && h.shared["font-sans"] === DEFAULT_THEME.shared["font-sans"], "url() and expression() are rejected");
assert(!themeToCss(h, false).includes("url(") && !themeToCss(h, false).includes("expression"), "applied CSS never contains hostile values");

assert(!isValidValue("color", "red; } body { display:none") && isValidValue("color", "oklch(60% 0.1 150)"), "color validation");
assert(isValidValue("font", '"Atkinson Hyperlegible", Georgia, serif') && !isValidValue("font", "a, url(x)"), "font validation");
assert(isValidValue("length", "1.25rem") && !isValidValue("length", "calc(1px + 1px)"), "length validation");

const s = sanitizeTheme({ scheme: "dark", shared: { radius: "12px", bogus: "1" }, light: { accent: "not a color!" } });
assert(s.scheme === "dark" && s.shared.radius === "12px" && s.light.accent === DEFAULT_THEME.light.accent && !("bogus" in s.shared), "sanitizeTheme keeps valid, drops unknown, defaults invalid");
assert(sanitizeTheme(null).scheme === "system", "null input yields defaults");
