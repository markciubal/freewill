// Maps: theme tokens become a map palette, the drawing rules name layers that
// exist in the Protomaps basemap schema, and the configured map file (or the
// public demo planet, when reachable) really carries those layers.
// Run: npm run smoke:map
import { PMTiles } from "pmtiles";
import { PLACE_CLASSES, ROAD_CLASSES, concreteFontStack, paletteFromTokens } from "../src/lib/map-theme";
import { originOfUrlTemplate } from "../src/lib/security";
import { DEFAULT_THEME, isValidValue, sanitizeTheme } from "../src/lib/theme";
import { cssToTheme, themeToCss } from "../src/lib/theme.css";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

// The layers and kinds the drawing rules rely on. Anyone building a map file
// from their own data needs to produce these names (docs/maps.md).
const LAYERS_USED = ["earth", "landuse", "water", "buildings", "roads", "boundaries", "places"];

async function main() {
  // Every color the map needs comes out of the theme, for both schemes.
  for (const scheme of ["light", "dark"] as const) {
    const tokens = { ...DEFAULT_THEME.shared, ...DEFAULT_THEME[scheme] };
    const palette = paletteFromTokens((name) => tokens[name] ?? "");
    const colors = [palette.land, palette.water, palette.road, palette.building, palette.boundary, palette.park, palette.label, palette.labelHalo, palette.roadLabel];
    assert(colors.every((c) => isValidValue("color", c)), `${scheme} theme yields a valid color for every map role`);
    assert(palette.labelHalo === palette.land, `${scheme}: label halo is the land color so names read over lines`);
  }
  const fromEmpty = paletteFromTokens(() => "");
  assert(isValidValue("color", fromEmpty.water) && fromEmpty.fontFamily.length > 0, "with no theme readable, the palette falls back to defaults");
  assert(concreteFontStack("var(--font-geist-sans), system-ui, sans-serif") === "system-ui, sans-serif", "canvas fonts drop var() parts the canvas cannot resolve");

  // The new map tokens survive the theme editor's CSS round trip and the sanitizer.
  const custom = sanitizeTheme({ ...DEFAULT_THEME, light: { ...DEFAULT_THEME.light, "map-water": "#1e90ff" } });
  assert(custom.light["map-water"] === "#1e90ff", "a person's own map water color is kept by the sanitizer");
  assert(cssToTheme(themeToCss(custom), DEFAULT_THEME).light["map-water"] === "#1e90ff", "map colors round-trip through the CSS editor");
  assert(sanitizeTheme({ light: { "map-road": "url(javascript:x)" } }).light["map-road"] === DEFAULT_THEME.light["map-road"], "a non-color map value falls back to the default");

  // The drawing rules use zoom stops that rise with zoom, so wide roads stay wide.
  assert(ROAD_CLASSES.every((r) => r.widthStops.every((s, i, all) => i === 0 || s[1] >= all[i - 1][1])), "road widths never shrink as you zoom in");
  assert(PLACE_CLASSES[0].minZoom < PLACE_CLASSES[PLACE_CLASSES.length - 1].minZoom, "bigger places label first, neighbourhoods last");

  // CSP: a remote map file's host is allowed for fetches; a local one needs nothing.
  assert(originOfUrlTemplate("https://files.example.org/maps/local.pmtiles") === "https://files.example.org", "a remote map file host is derived for connect-src");

  // Live: the configured map file, or the public demo planet, carries the layers used.
  const url = process.env.NEXT_PUBLIC_PMTILES_URL && !process.env.NEXT_PUBLIC_PMTILES_URL.startsWith("/")
    ? process.env.NEXT_PUBLIC_PMTILES_URL
    : "https://demo-bucket.protomaps.com/v4.pmtiles";
  try {
    const archive = new PMTiles(url);
    const metadata = (await archive.getMetadata()) as { vector_layers?: { id: string }[] };
    const layerIds = new Set((metadata.vector_layers ?? []).map((l) => l.id));
    const missing = LAYERS_USED.filter((id) => !layerIds.has(id));
    assert(missing.length === 0, `map data at ${url.replace(/^https?:\/\//, "")} has every layer the rules draw (${LAYERS_USED.join(", ")})${missing.length ? `; missing ${missing.join(", ")}` : ""}`);
  } catch (error) {
    console.log("(map data not reachable; skipped live layer check)", (error as Error).message.split("\n")[0]);
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
