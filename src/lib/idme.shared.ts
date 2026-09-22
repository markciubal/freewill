// Pure ID.me helpers with no secret and no server-only guard, so they can be
// unit-tested and safely reasoned about. The one secret-touching function
// (idmeSubjectHash) lives in idme.ts behind "server-only". App code imports
// everything from "@/lib/idme", which re-exports this module.

export function idmeEnabled() {
  return process.env.IDME_ENABLED === "true";
}

// The affiliations an ID.me app can verify. Each is a "policy" with a handle
// (the OAuth scope) that ID.me confirms. A deployment offers a subset via
// IDME_POLICIES; these are the ones this app's ID.me registration supports.
export type Policy = { handle: string; label: string; hint: string };

// Military is deliberately not here, and IDME_POLICIES cannot add it back:
// only handles in this list are ever offered, stored or shown. This app is for
// the weeks after a government turns on its people. In a seized database, a
// searchable list of soldiers, veterans and their families is a target list;
// in the hands of a would-be strongman it is a recruiting list. Neither helps
// anyone find a nurse. Badges stored before it was dropped are hidden by
// knownAffiliations and fall away on the next ID.me verification.
export const IDME_ALL_POLICIES: Policy[] = [
  { handle: "nurse", label: "Nurse", hint: "Licensed nurses, nursing assistants, and nurse practitioners" },
  { handle: "responder", label: "First responder", hint: "EMTs, firefighters, law enforcement, and dispatchers" },
  { handle: "teacher", label: "Teacher", hint: "PreK-12 and higher-education faculty" },
  { handle: "government", label: "Government worker", hint: "Federal, state, and local government employees" },
];

// The stored affiliations this app still recognizes, in their stored order.
// Everything that shows, searches or keeps a badge goes through this.
export function knownAffiliations(handles: string[]): string[] {
  return handles.filter((handle) => IDME_ALL_POLICIES.some((policy) => policy.handle === handle));
}

export function idmePolicies(): Policy[] {
  const raw = process.env.IDME_POLICIES?.trim();
  if (!raw) return IDME_ALL_POLICIES;
  const enabled = new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  return IDME_ALL_POLICIES.filter((p) => enabled.has(p.handle));
}

export function policyLabel(handle: string) {
  return IDME_ALL_POLICIES.find((p) => p.handle === handle)?.label ?? handle;
}

export function idmeConfig() {
  const clientId = process.env.IDME_CLIENT_ID;
  const clientSecret = process.env.IDME_CLIENT_SECRET;
  const redirectUri = process.env.IDME_REDIRECT_URI;
  const apiBase = (process.env.IDME_API_BASE || "https://api.id.me").replace(/\/$/, "");
  if (!idmeEnabled() || !clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri, apiBase };
}

// The public origin the browser actually used, for building redirects back to
// the app. In a route handler `request.url` is the internal address the dyno
// received (on Heroku, http://localhost:$PORT), so it must never be used for a
// browser redirect. Heroku and most proxies set x-forwarded-proto/host to the
// real values; fall back to NEXT_PUBLIC_SITE_URL, then to request.url.
export function publicOrigin(request: Request): string {
  const h = request.headers;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host")?.trim();
  // A visit through the onion service (plain http inside Tor) stays there. No
  // web host serves an onion address, so the Host alone is enough here.
  if (host && /^[a-z2-7]{56}\.onion(:\d+)?$/i.test(host)) return `http://${host.toLowerCase()}`;
  if (host && proto) return `${proto}://${host}`;
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (host) return `https://${host}`;
  return new URL(request.url).origin;
}

// Pull a stable subject id out of whatever the token or attributes endpoint
// returned. ID.me offers OIDC (sub) and a legacy attributes list (uuid).
export function extractSubject(idTokenPayload: Record<string, unknown> | null, attributes: unknown): string | null {
  if (idTokenPayload && typeof idTokenPayload.sub === "string" && idTokenPayload.sub) return idTokenPayload.sub;
  if (idTokenPayload && typeof idTokenPayload.uuid === "string" && idTokenPayload.uuid) return idTokenPayload.uuid;
  if (Array.isArray(attributes)) {
    for (const a of attributes) {
      if (a && typeof a === "object" && (a as { handle?: string }).handle === "uuid") {
        const v = (a as { value?: unknown }).value;
        if (typeof v === "string" && v) return v;
      }
    }
  }
  if (attributes && typeof attributes === "object") {
    const v = (attributes as { uuid?: unknown; sub?: unknown }).uuid ?? (attributes as { sub?: unknown }).sub;
    if (typeof v === "string" && v) return v;
  }
  return null;
}

// Which of our known policy handles ID.me reports as verified. ID.me returns
// this in different shapes across OIDC and the legacy attributes list, so look
// in all the likely places and keep only handles we recognize.
export function extractAffiliations(idTokenPayload: Record<string, unknown> | null, attributes: unknown): string[] {
  const known = new Set(IDME_ALL_POLICIES.map((p) => p.handle));
  const found = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && known.has(v.toLowerCase())) found.add(v.toLowerCase());
  };

  for (const key of ["group", "groups", "affiliation", "affiliations"]) {
    const v = idTokenPayload?.[key];
    if (Array.isArray(v)) v.forEach(add);
    else add(v);
  }
  if (Array.isArray(attributes)) {
    for (const a of attributes) {
      if (!a || typeof a !== "object") continue;
      const o = a as { handle?: string; group?: string; value?: unknown; verified?: unknown };
      if ((o.handle === "group" || o.handle === "affiliation") && typeof o.value === "string") add(o.value);
      if (o.group && o.verified !== false) add(o.group);
    }
  } else if (attributes && typeof attributes === "object") {
    const o = attributes as Record<string, unknown>;
    for (const key of ["group", "groups", "affiliation", "affiliations", "status"]) {
      const v = o[key];
      if (Array.isArray(v)) v.forEach((x) => (typeof x === "object" && x ? add((x as { group?: string }).group) : add(x)));
      else add(v);
    }
  }
  return [...found];
}

export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split(".")[1];
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
