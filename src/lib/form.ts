import { redirect } from "next/navigation";

// Small helpers for server actions that use plain <form action={...}>.

export function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

export function fail(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}error=${encodeURIComponent(message)}`);
}

export function ok(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}ok=${encodeURIComponent(message)}`);
}

export function firstIssue(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  const i = error.issues[0];
  const where = i.path.length ? `${String(i.path[0])}: ` : "";
  return `${where}${i.message}`;
}

export const isObjectId = (s: string | undefined): s is string => !!s && /^[0-9a-fA-F]{24}$/.test(s);

// Locality scoping lives in src/lib/geo.ts (local / near / all).
export { readScope, scopeWhere } from "./geo";

// Locality is set once and never changed. Free text, anywhere in the world,
// normalized lightly so "north ridge" and "North Ridge" are the same place.
export function normalizeLocality(s: string) {
  return s.trim().replace(/s+/g, " ").toLowerCase().replace(/w/g, (c) => c.toUpperCase());
}
