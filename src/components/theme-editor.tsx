"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resetTheme, saveTheme } from "@/app/(app)/theme/actions";
import { COLOR_TOKENS, DEFAULT_THEME, SCHEMES, SHARED_TOKENS, type Scheme, type Theme, type TokenDef } from "@/lib/theme";
import { cssToTheme, themeToCss } from "@/lib/theme.css";
import { Badge, Button, Card, Field, Grace, Input, SectionTitle } from "./ui";

// Two views of one theme: controls and CSS. Either edits the other, and both
// restyle the whole app as you type by writing a <style> after the saved one.

export function ThemeEditor({ initial }: { initial: Theme }) {
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

  const colorRow = (part: "light" | "dark", d: TokenDef) => (
    <label key={`${part}-${d.name}`} className="flex items-center gap-2 text-sm">
      <input type="color" value={isHex(theme[part][d.name]) ? theme[part][d.name] : "#888888"} onChange={(e) => update(part, d.name, e.target.value)} className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border bg-transparent" title={d.hint} />
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
          <SectionTitle>Type and shape</SectionTitle>
          {SHARED_TOKENS.map((d) => (
            <Field key={d.name} label={d.label} hint={d.hint}>
              <Input value={theme.shared[d.name]} onChange={(e) => update("shared", d.name, e.target.value)} className="font-mono text-xs" />
            </Field>
          ))}
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="space-y-2"><SectionTitle>Light colors</SectionTitle>{COLOR_TOKENS.map((d) => colorRow("light", d))}</Card>
          <Card className="space-y-2"><SectionTitle>Dark colors</SectionTitle>{COLOR_TOKENS.map((d) => colorRow("dark", d))}</Card>
        </div>
      </div>

      <div className="space-y-4">
        <Card className="space-y-3">
          <SectionTitle>Preview</SectionTitle>
          <h3 className="text-xl font-semibold">Insulin, two weeks</h3>
          <p className="text-sm text-muted">Type 1, eleven years old. We have four days left. Any brand.</p>
          <div className="flex flex-wrap gap-2"><Badge tone="danger">NEED</Badge><Badge tone="warn">MATCHED</Badge><Badge tone="accent">OFFER</Badge><Badge>Medical</Badge></div>
          <div className="flex flex-wrap gap-2"><Button type="button">Give my word</Button><Button type="button" variant="ghost">Decline</Button><Button type="button" variant="danger">Withdraw</Button></div>
          <Input placeholder="@neighbor" readOnly />
          <table className="w-full text-sm"><tbody>
            <tr className="border-t border-border"><td className="p-2 text-muted">Aug 24</td><td className="p-2">@ada</td><td className="p-2 text-right font-mono text-accent">+<Grace n={20} /></td></tr>
            <tr className="border-t border-border"><td className="p-2 text-muted">Aug 23</td><td className="p-2">@bo</td><td className="p-2 text-right font-mono text-danger">-1h 30m</td></tr>
          </tbody></table>
        </Card>
        <Card className="space-y-2">
          <SectionTitle>The CSS, live</SectionTitle>
          <textarea value={css} onChange={(e) => onCss(e.target.value)} spellCheck={false} rows={28} className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:border-accent" />
          <p className="text-xs text-muted">Lines that are not valid colors, fonts, or lengths are ignored; the last good value stays.</p>
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
