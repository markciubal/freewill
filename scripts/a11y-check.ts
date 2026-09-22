// Can everyone use it? Readable colors, hints a screen reader reads as hints,
// messages that are announced, a way past the menu, and examples that say
// they are examples. Renders the real components; needs no database.
// Run: npm run smoke:a11y
import "./not-production";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";
import { Examples } from "../src/components/examples";
import { GraceMark } from "../src/components/grace-mark";
import { InfoDot } from "../src/components/info-dot";
import { Field, Grace, MINUS, Notice, Textarea, fmtGrace, fmtHours } from "../src/components/ui";
import { MIN_TEXT_CONTRAST, contrastProblems, contrastRatio, fmtRatio, parseColor } from "../src/lib/contrast";
import { EXAMPLES } from "../src/lib/examples";
import { failIssue } from "../src/lib/form";
import { DEFAULT_THEME } from "../src/lib/theme";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
function sources(dir: string, pattern: RegExp): string[] {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((item) => {
    const rel = path.join(dir, item.name);
    if (item.isDirectory()) return sources(rel, pattern);
    return pattern.test(item.name) ? [rel] : [];
  });
}
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// --- Colors a person can read ---------------------------------------------------
assert(JSON.stringify(parseColor("#fff")) === "[255,255,255]" && JSON.stringify(parseColor("#1c1a17")) === "[28,26,23]" && JSON.stringify(parseColor("rgb(10 20 30 / 50%)")) === "[10,20,30]" && parseColor("oklch(0.5 0.1 120)") === null, "colors are read from hex and rgb(), and anything else is left to the browser rather than guessed");
assert(Math.abs(contrastRatio([0, 0, 0], [255, 255, 255]) - 21) < 0.01 && contrastRatio([90, 90, 90], [90, 90, 90]) === 1, "black on white is 21 to 1 and a color on itself is 1 to 1");
assert(fmtRatio(4.49) === "4.4 to 1", "a ratio is never rounded up to look like it passes");
for (const scheme of ["light", "dark"] as const) {
  const problems = contrastProblems(DEFAULT_THEME[scheme]);
  assert(problems.length === 0, `the default ${scheme} colors keep every kind of text at ${MIN_TEXT_CONTRAST} to 1 or more${problems.length ? `; below: ${problems.map((p) => `${p.where} ${fmtRatio(p.ratio)}`).join(", ")}` : ""}`);
}
const oldWarn = contrastProblems({ ...DEFAULT_THEME.light, warn: "#b7791f" });
assert(oldWarn.some((p) => p.text === "warn"), `the check catches the old warning color, which was ${fmtRatio(oldWarn.find((p) => p.text === "warn")?.ratio ?? 0)} on a card`);

// --- Hints are read as hints ------------------------------------------------------
type FieldProps = Parameters<typeof Field>[0];
const field = renderToStaticMarkup(createElement(Field, { label: "Details", hint: "What happened, and where." } as FieldProps, createElement(Textarea, { name: "body" })));
const describedBy = /<textarea[^>]*aria-describedby="([^"]+)"/.exec(field)?.[1];
const hintId = /<span id="([^"]+)"[^>]*>What happened, and where\.<\/span>/.exec(field)?.[1];
assert(!!describedBy && describedBy === hintId, "a Field's hint is linked to its control, so it is read as a description");
assert(!/<label[^>]*>(?:(?!<\/label>)[\s\S])*What happened, and where/.test(field), "the hint is not inside the label, so it is not read as part of the field's name");
const kept = renderToStaticMarkup(createElement(Field, { label: "Note", hint: "Short." } as FieldProps, createElement(Textarea, { name: "note", "aria-describedby": "other" })));
assert(/aria-describedby="other [^"]+"/.test(kept), "a control's own description is kept when the hint is added");

// Every textarea in the app has a hint, in the Field it sits in.
const tsx = sources("src", /\.tsx$/).map((file) => ({ file, text: withoutComments(read(file)) }));
const unhinted: string[] = [];
let textareas = 0;
for (const { file, text } of tsx) {
  for (const match of text.matchAll(/<Textarea\b/g)) {
    textareas++;
    const before = text.slice(0, match.index);
    const opened = before.lastIndexOf("<Field");
    const between = opened < 0 ? "" : before.slice(opened);
    if (opened < 0 || between.includes("</Field>") || !/\bhint=/.test(between)) unhinted.push(`${file}:${before.split("\n").length}`);
  }
}
assert(textareas >= 17 && unhinted.length === 0, `every one of the ${textareas} textareas has a hint that stays on screen${unhinted.length ? `; without: ${unhinted.join(", ")}` : ""}`);
// The Textarea primitive itself is named by the Field around it.
const rawTextareas = tsx.filter(({ file }) => !file.endsWith(path.join("components", "ui.tsx"))).flatMap(({ file, text }) => [...text.matchAll(/<textarea\b[\s\S]*?\/>/g)].filter((m) => !/aria-label=|id=/.test(m[0])).map(() => file));
assert(rawTextareas.length === 0, `a bare <textarea> outside a Field carries its own name${rawTextareas.length ? `; not: ${rawTextareas.join(", ")}` : ""}`);
const unnamedPickers = tsx.flatMap(({ file, text }) => [...text.matchAll(/<input type="color"[\s\S]*?\/>/g)].filter((m) => !m[0].includes("aria-label=")).map(() => file));
assert(unnamedPickers.length === 0, "every color picker has a name of its own");

// --- Messages are announced, and errors take you to the field ------------------------
const alert = renderToStaticMarkup(createElement(Notice, { error: "Title needs at least 3 characters." }));
const status = renderToStaticMarkup(createElement(Notice, { ok: "Posted." }));
assert(/role="alert"/.test(alert) && /tabindex="-1"/i.test(alert) && /role="status"/.test(status) && !/role="alert"/.test(status), "an error is announced as an alert and can take focus; good news is a polite status");
const listing = z.object({ title: z.string().min(3) }).safeParse({ title: "ab" });
try {
  if (!listing.success) failIssue("/board/new", listing.error);
  assert(false, "a failed form redirects");
} catch (error) {
  const digest = String((error as { digest?: string }).digest ?? "");
  assert(digest.includes("/board/new?error=Title%20needs%20at%20least%203%20characters.&field=title"), "a failed form sends back its message and the field it is about");
}
const actions = sources("src/app", /^actions\.ts$/).map((file) => ({ file, text: read(file) }));
const bare = actions.filter(({ text }) => /\bfail\([^;]*firstIssue\(/.test(text)).map(({ file }) => file);
assert(bare.length === 0, `every form's validation failure names its field (failIssue)${bare.length ? `; not: ${bare.join(", ")}` : ` (${actions.length} action files)`}`);
const authPages = ["src/app/(auth)/join/page.tsx", "src/app/(auth)/login/page.tsx"];
assert(authPages.every((file) => /<Notice[^>]*field=\{state\.field\}/.test(read(file))), "sign-in and join pass the field with their errors, since their state does not come back in the address");

// --- Inline graphics sit on the text ---------------------------------------------------
// Measured in a browser when this was set (every mark within half a pixel of
// the middle of the capitals beside it); held here by the rules that produce it.
const mark = renderToStaticMarkup(createElement(GraceMark));
assert(/viewBox="5 0 14 24"/.test(mark) && /width:calc\(1em \* 14 \/ 24\)/.test(mark) && /height:1em/.test(mark), "the Grace sprig is cropped to its drawing, so no empty margin reads as a space before the number");
assert(/vertical-align:calc\(0\.365em - 1em \* 0\.4875\)/.test(mark) && /vertical-align:calc\(0\.365em - 1\.6em \* 0\.4875\)/.test(renderToStaticMarkup(createElement(GraceMark, { size: "1.6em" }))), "the sprig is lifted by its own size, so its middle meets the middle of the digits at any size");
const negative = renderToStaticMarkup(createElement(Grace, { n: -150 }));
assert(negative.startsWith(`<span class="whitespace-nowrap tabular-nums ">${MINUS}<svg`) && /mx-\[0\.1em\]/.test(negative) && !/>-</.test(negative), "a negative amount starts with a real minus sign, spaced evenly around the sprig");
assert(fmtGrace(-150) === `${MINUS}1.50 GRC` && fmtHours(-90) === `${MINUS}1h 30m` && MINUS === "−", "amounts written as text use the minus sign too, which screen readers say as minus");
const dot = renderToStaticMarkup(createElement(InfoDot, { term: "grace" }));
assert(/width:max\(13px, 0\.85em\);height:max\(13px, 0\.85em\)/.test(dot) && /vertical-align:calc\(0\.355em - max\(13px, 0\.85em\) \/ 2\)/.test(dot), "the (i) scales with the words beside it and centers on their capitals");
assert(/<button[^>]*aria-label="About Grace"[^>]*><svg/.test(dot) && /before:h-7 before:w-7/.test(dot), "the (i) is drawn rather than typed, and answers a tap 28px across whatever its size");
assert(!/align-middle|align-\[/.test(read("src/components/ui.tsx").split("export function PageTitle")[1].split("}")[0]), "nothing overrides the (i)'s own alignment beside a page title");

// --- A way past the menu -----------------------------------------------------------
const layout = read("src/app/(app)/layout.tsx");
assert(layout.indexOf('href="#main"') > -1 && layout.indexOf('href="#main"') < layout.indexOf("<MainNav") && /<main id="main"/.test(layout), "the first thing a keyboard reaches is a link past the menu to the page");

// --- Examples say they are examples --------------------------------------------------
const sets = Object.values(EXAMPLES);
const names = sets.flatMap((set) => set.items.map((item) => item.by));
assert(names.every((name) => /^@[a-z]+(-[a-z]+)+$/.test(name)), `every example is by a name no username can hold (${[...new Set(names)].join(", ")})`);
for (const set of sets) {
  const html = renderToStaticMarkup(createElement(Examples, { set }));
  const flagged = (html.match(/>example</g) ?? []).length;
  assert(html.includes("Examples, not real posts") && flagged === set.items.length && (html.match(/\(made up\)/g) ?? []).length === set.items.length, `the ${set.key} examples are headed as not real, and each one is marked (${flagged} of ${set.items.length})`);
}
const pages = tsx.filter(({ text }) => text.includes("<Examples"));
const shownAlone = pages.filter(({ text }) => [...text.matchAll(/<Examples\b/g)].some((m) => !text.slice(Math.max(0, (m.index ?? 0) - 400), m.index).includes("<Empty>"))).map(({ file }) => file);
assert(pages.length === sets.length && shownAlone.length === 0, `examples appear only under an empty list, never beside real posts (${pages.length} pages)${shownAlone.length ? `; not: ${shownAlone.join(", ")}` : ""}`);
