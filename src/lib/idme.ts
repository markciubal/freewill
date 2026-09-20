import "server-only";
import { createHmac } from "node:crypto";

// Optional ID.me attestation, off unless a deployment sets IDME_ENABLED=true.
// This is attestation, not login: nobody signs in with it, and it gates
// nothing. Its single effect is one extra vouch toward local verification
// (src/lib/standing.ts). We keep only a date and an HMAC of the ID.me subject
// id, so one legal identity cannot attest for many accounts - never a name,
// birthdate, or document. Be honest in the UI: ID.me itself keeps a record
// linking the person's legal identity to this community.

export function idmeEnabled() {
  return process.env.IDME_ENABLED === "true";
}

export function idmeConfig() {
  const clientId = process.env.IDME_CLIENT_ID;
  const clientSecret = process.env.IDME_CLIENT_SECRET;
  const redirectUri = process.env.IDME_REDIRECT_URI;
  const apiBase = (process.env.IDME_API_BASE || "https://api.idmelabs.com").replace(/\/$/, "");
  const scope = process.env.IDME_SCOPE || "openid";
  if (!idmeEnabled() || !clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri, apiBase, scope };
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
  if (host && proto) return `${proto}://${host}`;
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (host) return `https://${host}`;
  return new URL(request.url).origin;
}

// A stable one-way handle for "this legal identity, in this deployment".
export function idmeSubjectHash(subject: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set");
  return createHmac("sha256", secret).update(`idme:${subject}`).digest("hex");
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

export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split(".")[1];
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
