// Theme serialization round-trips, and bad input is rejected. Run: npm run smoke:theme
import "./not-production";
import { DEFAULT_MAP_PRESET, DEFAULT_THEME, MAP_PRESETS, applyMapPreset, isValidValue, matchingMapPreset, sanitizeTheme } from "../src/lib/theme";
import { cssToTheme, themeToCss } from "../src/lib/theme.css";

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else console.log("ok:", msg);
}

const css = themeToCss(DEFAULT_THEME);
assert(JSON.stringify(cssToTheme(css, DEFAULT_THEME)) === JSON.stringify(DEFAULT_THEME), "default theme round-trips through CSS");

// Built from the current defaults rather than literals, so changing a default
// value cannot quietly stop this test from testing anything.
const edited = css
  .replace(`--accent: ${DEFAULT_THEME.light.accent};`, "--accent: #aa2266;")
  .replace(`--radius: ${DEFAULT_THEME.shared.radius};`, "--radius: 0px;");
const t = cssToTheme(edited, DEFAULT_THEME);
assert(t.light.accent === "#aa2266" && t.dark.accent === DEFAULT_THEME.dark.accent, "editing a light color changes only light");
assert(t.shared.radius === "0px", "shared token edited from CSS");

const darkEdited = css.replace(/\/\* @dark \*\/[\s\S]*$/, `/* @dark */\n:root[data-theme="dark"] {\n  --background: hsl(20 10% 8%);\n}\n`);
assert(cssToTheme(darkEdited, DEFAULT_THEME).dark.background === "hsl(20 10% 8%)", "dark block parsed, hsl accepted");

const hostile = css
  .replace(`--accent: ${DEFAULT_THEME.light.accent};`, '--accent: url("https://evil/x");')
  .replace(`--font-sans: ${DEFAULT_THEME.shared["font-sans"]};`, "--font-sans: expression(alert(1));");
const h = cssToTheme(hostile, DEFAULT_THEME);
assert(h.light.accent === DEFAULT_THEME.light.accent && h.shared["font-sans"] === DEFAULT_THEME.shared["font-sans"], "url() and expression() are rejected");
assert(!themeToCss(h, false).includes("url(") && !themeToCss(h, false).includes("expression"), "applied CSS never contains hostile values");

assert(!isValidValue("color", "red; } body { display:none") && isValidValue("color", "oklch(60% 0.1 150)"), "color validation");
assert(isValidValue("font", '"Atkinson Hyperlegible", Georgia, serif') && !isValidValue("font", "a, url(x)"), "font validation");
assert(isValidValue("length", "1.25rem") && !isValidValue("length", "calc(1px + 1px)"), "length validation");

const s = sanitizeTheme({ scheme: "dark", shared: { radius: "12px", bogus: "1" }, light: { accent: "not a color!" } });
assert(s.scheme === "dark" && s.shared.radius === "12px" && s.light.accent === DEFAULT_THEME.light.accent && !("bogus" in s.shared), "sanitizeTheme keeps valid, drops unknown, defaults invalid");
assert(sanitizeTheme(null).scheme === "system", "null input yields defaults");

// Map presets and the filter kind.
{
  assert(DEFAULT_MAP_PRESET.key === "cypherpunk" && DEFAULT_THEME.light["map-road"] === DEFAULT_MAP_PRESET.light["map-road"] && DEFAULT_THEME.shared["map-glow"] === DEFAULT_MAP_PRESET.glow, "the default map look is Cypherpunk");
  assert(matchingMapPreset(DEFAULT_THEME)?.key === "cypherpunk", "a fresh theme is recognized as the Cypherpunk preset");
  for (const preset of MAP_PRESETS) {
    const applied = applyMapPreset(DEFAULT_THEME, preset);
    assert(JSON.stringify(sanitizeTheme(applied)) === JSON.stringify(applied) && matchingMapPreset(applied)?.key === preset.key, `preset "${preset.label}" is entirely valid and round-trips`);
  }
  const tweaked = { ...DEFAULT_THEME, light: { ...DEFAULT_THEME.light, "map-road": "#ff00aa" } };
  assert(matchingMapPreset(tweaked) === null, "changing one map color makes the map custom");
  assert(isValidValue("filter", "none") && isValidValue("filter", "invert(1) hue-rotate(180deg) brightness(0.8)") && isValidValue("filter", "grayscale(100%)"), "filter validation accepts the allowed functions");
  assert(!isValidValue("filter", "url(#x)") && !isValidValue("filter", "drop-shadow(0 0 2px red)") && !isValidValue("filter", "invert(1); background: url(x)"), "filter validation rejects url(), drop-shadow, and injection");
  assert(sanitizeTheme({ light: { "map-filter": "url(#evil)" } }).light["map-filter"] === DEFAULT_THEME.light["map-filter"], "a hostile filter falls back to the default");
  assert(cssToTheme(themeToCss(DEFAULT_THEME), DEFAULT_THEME).light["map-filter"] === DEFAULT_THEME.light["map-filter"], "the filter round-trips through the CSS editor");
  assert(isValidValue("length", "0px") && sanitizeTheme({ shared: { elevation: "0px" } }).shared.elevation === "0px", "depth can be turned off with 0px");
}
