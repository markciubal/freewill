import { redirect } from "next/navigation";

// Small helpers for server actions that use plain <form action={...}>.

export function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

// `field` names the form field the message is about, so the page can mark it
// invalid and move focus to it (ErrorFocus, src/components/error-focus.tsx).
export function fail(path: string, message: string, field?: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}error=${encodeURIComponent(message)}${field ? `&field=${encodeURIComponent(field)}` : ""}`);
}

export function ok(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}ok=${encodeURIComponent(message)}`);
}

// Plain names for the fields the actions validate, so a form that fails says
// "Title needs at least 3 characters." rather than zod's own wording
// ("title: Too small: expected string to have >=3 characters").
const FIELD_LABEL: Record<string, string> = {
  about: "Who it is about",
  account: "What happened",
  amount: "Amount",
  bio: "About you",
  body: "Details",
  category: "Category",
  closesInDays: "Days open",
  confirmPassword: "The new password, typed again,",
  covenant: "Agreeing to the ground rules",
  currentPassword: "Your current password",
  daysToMaturity: "Days to maturity",
  denomination: "Denomination",
  description: "Details",
  displayName: "Display name",
  everywhere: "Where it shows",
  expiresInDays: "Days until it expires",
  form: "Form",
  kind: "Type",
  lat: "Latitude",
  level: "Level",
  lng: "Longitude",
  locality: "Locality",
  memo: "What it was for",
  name: "Name",
  newPassword: "New password",
  note: "Note",
  openPollinated: "Open-pollinated",
  options: "The list of options",
  password: "Password",
  priceGrace: "Grace ask",
  priceHours: "Hours ask",
  publicKey: "Node key",
  quantity: "Quantity",
  rules: "Rules",
  skills: "Skills",
  sowMonths: "Sow months",
  title: "Title",
  to: "Who to pay",
  url: "Address",
  username: "Username",
  wantsInReturn: "What you would take in return",
  why: "Why",
  yearSaved: "Year saved",
};

function labelFor(path: PropertyKey[]): string {
  const key = path.length ? String(path[0]) : "";
  if (FIELD_LABEL[key]) return FIELD_LABEL[key];
  // An unlisted field: "someField" becomes "Some field".
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "That";
}

type Issue = { message: string; path: PropertyKey[]; code?: string; minimum?: unknown; maximum?: unknown; origin?: string; expected?: string };

// Zod's built-in messages all start this way; the messages written in this
// app never do. Anything else is ours and is shown as written.
const ZOD_DEFAULT = /^(Too small|Too big|Invalid|Unrecognized)/;

export function firstIssue(error: { issues: Issue[] }): string {
  const issue = error.issues[0];
  if (!ZOD_DEFAULT.test(issue.message)) return /[.!?]$/.test(issue.message) ? issue.message : `${issue.message}.`;

  const label = labelFor(issue.path);
  const min = Number(issue.minimum);
  const max = Number(issue.maximum);
  switch (issue.code) {
    case "too_small":
      if (issue.origin === "string") return min <= 1 ? `${label} is required.` : `${label} needs at least ${min} characters.`;
      if (issue.origin === "array") return min <= 1 ? `${label} needs at least one entry.` : `${label} needs at least ${min} entries.`;
      return `${label} must be at least ${min}.`;
    case "too_big":
      if (issue.origin === "string") return `${label} can be at most ${max} characters.`;
      if (issue.origin === "array") return `${label} can have at most ${max} entries.`;
      return `${label} can be at most ${max}.`;
    case "invalid_type":
      if (/received (undefined|null)/.test(issue.message)) return `${label} is required.`;
      if (issue.expected === "number") return `${label} must be a number.`;
      return `${label} is not valid.`;
    case "invalid_value":
      return `${label}: choose one of the options.`;
    case "invalid_format":
      return `${label} is not in the right form.`;
    default:
      return `${label} is not valid.`;
  }
}

// A failed validation, sent back with its message and the field it is about.
// Use this, not fail(path, firstIssue(...)), so the page can take the person
// to the field (smoke:a11y checks every action does).
export function failIssue(path: string, error: { issues: Issue[] }): never {
  fail(path, firstIssue(error), issueField(error));
}

// The form field the first issue is about, when it names one.
export function issueField(error: { issues: Issue[] }): string | undefined {
  const field = error.issues[0]?.path[0];
  return typeof field === "string" ? field : undefined;
}

export const isObjectId = (s: string | undefined): s is string => !!s && /^[0-9a-fA-F]{24}$/.test(s);

// Locality scoping lives in src/lib/geo.ts (local / near / all).
export { readScope, scopeWhere } from "./geo";

// Free text, anywhere in the world. Preserve the person's own capitalization
// and characters; only trim and collapse runs of whitespace. Matching is
// case-insensitive (scopeWhere, localityKey), so "north ridge" and "North
// Ridge" are the same place without mangling what they typed.
export function normalizeLocality(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

// A lowercased key for grouping and comparing localities regardless of casing.
export function localityKey(s: string) {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
