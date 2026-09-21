"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resetTheme, saveTheme } from "@/app/(app)/theme/actions";
import {
  COLOR_TOKENS,
  DEFAULT_THEME,
  MAP_PRESETS,
  MAP_TOKEN_NAMES,
  SCHEMES,
  SHARED_TOKENS,
  TOKENS,
  applyMapPreset,
  matchingMapPreset,
  type Scheme,
  type Theme,
  type TokenDef,
} from "@/lib/theme";
import { cssToTheme, themeToCss } from "@/lib/theme.css";
import { MapView } from "./map-view";
import { Badge, Button, Card, Field, Grace, Input, SectionTitle } from "./ui";

// Two views of one theme: controls and CSS. Either edits the other, and both
// restyle the whole app as you type by writing a <style> after the saved one.
// The map has its own section: a preset, then any single color, with a live
// preview drawn the way the real map will be.

const PAGE_COLOR_TOKENS = COLOR_TOKENS.filter((t) => !t.name.startsWith("map-"));
const MAP_COLOR_TOKENS = COLOR_TOKENS.filter((t) => t.name.startsWith("map-"));
const MAP_FILTER_TOKEN = TOKENS.find((t) => t.name === "map-filter")!;
const MAP_GLOW_TOKEN = SHARED_TOKENS.find((t) => t.name === "map-glow")!;
const PAGE_SHARED_TOKENS = SHARED_TOKENS.filter((t) => t.name !== "map-glow");

export function ThemeEditor({ initial, mapCenter }: { initial: Theme; mapCenter: { lat: number; lng: number } }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [css, setCss] = useState(() => themeToCss(initial));
  const editingCss = useRef(false);

  useEffect(() => {
    let el = document.getElementById("live-theme") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "live-theme";
      document.head.appendChild(el);
    }
    el.textContent = themeToCss(theme, false);
    if (theme.scheme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme.scheme;
    if (!editingCss.current) setCss(themeToCss(theme));
    editingCss.current = false;
  }, [theme]);

  const update = (part: "shared" | "light" | "dark", name: string, value: string) =>
    setTheme((t) => ({ ...t, [part]: { ...t[part], [name]: value } }));

  const onCss = (text: string) => {
    setCss(text);
    editingCss.current = true;
    setTheme(cssToTheme(text, theme));
  };

  const json = useMemo(() => JSON.stringify(theme), [theme]);
  const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

  // The preview map is rebuilt when a map token changes, a moment after the
  // last keystroke so typing a color does not rebuild it six times.
  const mapSignature = useMemo(
    () => JSON.stringify([theme.shared["map-glow"], ...MAP_TOKEN_NAMES.map((n) => [theme.light[n], theme.dark[n]]), theme.scheme]),
    [theme],
  );
  const [mapKey, setMapKey] = useState(mapSignature);
  useEffect(() => {
    const timer = setTimeout(() => setMapKey(mapSignature), 600);
    return () => clearTimeout(timer);
  }, [mapSignature]);
  const activePreset = matchingMapPreset(theme);

  const colorRow = (part: "light" | "dark", d: TokenDef) => (
    <label key={`${part}-${d.name}`} className="flex items-center gap-2 text-sm">
      <input type="color" value={isHex(theme[part][d.name]) ? theme[part][d.name] : "#888888"} onChange={(e) => update(part, d.name, e.target.value)} className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent" title={d.hint} />
      <span className="w-28 shrink-0">{d.label}</span>
      <input value={theme[part][d.name]} onChange={(e) => update(part, d.name, e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs" />
    </label>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card className="space-y-3">
          <SectionTitle>Scheme</SectionTitle>
          <div className="flex gap-2">
            {SCHEMES.map((s: Scheme) => (
              <Button key={s} type="button" variant={theme.scheme === s ? "primary" : "ghost"} onClick={() => setTheme((t) => ({ ...t, scheme: s }))}>
                {s === "system" ? "Follow device" : s === "light" ? "Light" : "Dark"}
              </Button>
            ))}
          </div>
        </Card>
        <Card className="space-y-3">
          <SectionTitle>Type, shape, depth</SectionTitle>
          {PAGE_SHARED_TOKENS.map((d) => (
            <Field key={d.name} label={d.label} hint={d.hint}>
              <Input value={theme.shared[d.name]} onChange={(e) => update("shared", d.name, e.target.value)} className="font-mono text-xs" />
            </Field>
          ))}
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="space-y-2"><SectionTitle>Light colors</SectionTitle>{PAGE_COLOR_TOKENS.map((d) => colorRow("light", d))}</Card>
          <Card className="space-y-2"><SectionTitle>Dark colors</SectionTitle>{PAGE_COLOR_TOKENS.map((d) => colorRow("dark", d))}</Card>
        </div>

        <Card className="space-y-3">
          <SectionTitle>Map</SectionTitle>
          <p className="text-xs text-muted">
            Pick a look, then change any color. On a self-hosted map the lines are drawn in these colors; on picture tiles the filter below approximates them. The small map for
            placing your pin always stays plain, so it is easy to find your way on it.
          </p>
          <div className="flex flex-wrap gap-2">
            {MAP_PRESETS.map((preset) => (
              <Button key={preset.key} type="button" variant={activePreset?.key === preset.key ? "primary" : "ghost"} title={preset.hint} onClick={() => setTheme((t) => applyMapPreset(t, preset))}>
                {preset.label}
              </Button>
            ))}
            {!activePreset && <Badge>custom</Badge>}
          </div>
          <MapView key={mapKey} center={mapCenter} points={[]} zoom={14} height="h-56" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted">Light scheme</div>
              {MAP_COLOR_TOKENS.map((d) => colorRow("light", d))}
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted">Dark scheme</div>
              {MAP_COLOR_TOKENS.map((d) => colorRow("dark", d))}
            </div>
          </div>
          <Field label={MAP_GLOW_TOKEN.label} hint={MAP_GLOW_TOKEN.hint}>
            <Input value={theme.shared["map-glow"]} onChange={(e) => update("shared", "map-glow", e.target.value)} className="font-mono text-xs" />
          </Field>
          <Field label={`${MAP_FILTER_TOKEN.label} (light scheme)`} hint={MAP_FILTER_TOKEN.hint}>
            <Input value={theme.light["map-filter"]} onChange={(e) => update("light", "map-filter", e.target.value)} className="font-mono text-xs" />
          </Field>
          <Field label={`${MAP_FILTER_TOKEN.label} (dark scheme)`}>
            <Input value={theme.dark["map-filter"]} onChange={(e) => update("dark", "map-filter", e.target.value)} className="font-mono text-xs" />
          </Field>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card className="space-y-3">
          <SectionTitle>Preview</SectionTitle>
          <h3 className="text-xl font-semibold">Insulin, two weeks</h3>
          <p className="text-sm text-muted">Type 1, eleven years old. We have four days left. Any brand.</p>
          <div className="flex flex-wrap gap-2"><Badge tone="danger">NEED</Badge><Badge tone="warn">MATCHED</Badge><Badge tone="accent">OFFER</Badge><Badge>Medical</Badge></div>
          <div className="flex flex-wrap gap-2"><Button type="button">Pledge</Button><Button type="button" variant="ghost">Decline</Button><Button type="button" variant="danger">Withdraw</Button></div>
          <Input placeholder="@neighbor" readOnly />
          <table className="w-full text-sm"><tbody>
            <tr className="border-t border-border"><td className="p-2 text-muted">Aug 24</td><td className="p-2">@ada</td><td className="p-2 text-right font-mono text-accent">+<Grace n={2000} /></td></tr>
            <tr className="border-t border-border"><td className="p-2 text-muted">Aug 23</td><td className="p-2">@bo</td><td className="p-2 text-right font-mono text-danger">-1h 30m</td></tr>
          </tbody></table>
        </Card>
        <Card className="space-y-2">
          <SectionTitle>The CSS, live</SectionTitle>
          <textarea value={css} onChange={(e) => onCss(e.target.value)} spellCheck={false} rows={28} className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:border-accent" />
          <p className="text-xs text-muted">Lines that are not valid colors, fonts, lengths, or filters are ignored; the last good value stays.</p>
          <div className="flex flex-wrap gap-2">
            <form action={saveTheme}><input type="hidden" name="theme" value={json} /><Button type="submit">Save</Button></form>
            <Button type="button" variant="ghost" onClick={() => setTheme(DEFAULT_THEME)}>Defaults (unsaved)</Button>
            <form action={resetTheme}><Button type="submit" variant="ghost">Reset and save defaults</Button></form>
            <Button type="button" variant="ghost" onClick={() => navigator.clipboard?.writeText(css)}>Copy CSS</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
