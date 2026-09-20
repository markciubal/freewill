import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { decodeJwtPayload, extractSubject, idmeConfig, idmeSubjectHash } from "@/lib/idme";

// Step 2: ID.me sends the person back with a code. Exchange it, take only a
// stable subject id, and record { humanVerifiedAt, HMAC(subject) }. One legal
// identity can attest for one account, enforced here before writing.
export async function GET(request: Request) {
  const back = (q: string) => NextResponse.redirect(new URL(`/profile?${q}`, request.url));
  const cfg = idmeConfig();
  if (!cfg) return back("error=" + encodeURIComponent("ID.me is not enabled here."));
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const saved = jar.get("idme_oauth")?.value;
  jar.delete("idme_oauth");
  let parsed: { state?: string; verifier?: string } = {};
  try { parsed = JSON.parse(saved ?? "{}"); } catch {}
  if (!code || !state || !parsed.state || state !== parsed.state) {
    return back("error=" + encodeURIComponent("The ID.me check did not complete. Nothing was recorded; try again."));
  }

  const tokenRes = await fetch(`${cfg.apiBase}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code,
      client_id: cfg.clientId, client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri, code_verifier: parsed.verifier ?? "",
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!tokenRes?.ok) return back("error=" + encodeURIComponent("ID.me did not accept the exchange. Nothing was recorded."));
  const tokens = (await tokenRes.json()) as { access_token?: string; id_token?: string };

  let subject = extractSubject(tokens.id_token ? decodeJwtPayload(tokens.id_token) : null, null);
  if (!subject && tokens.access_token) {
    const at = await fetch(`${cfg.apiBase}/api/public/v3/attributes.json?access_token=${encodeURIComponent(tokens.access_token)}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (at?.ok) {
      const j = (await at.json()) as { attributes?: unknown };
      subject = extractSubject(null, j.attributes ?? j);
    }
  }
  if (!subject) return back("error=" + encodeURIComponent("ID.me returned no stable identity. Nothing was recorded."));

  const hash = idmeSubjectHash(subject);
  const taken = await db.user.findFirst({ where: { idmeHash: hash, id: { not: userId } }, select: { id: true } });
  if (taken) return back("error=" + encodeURIComponent("That identity already attests for a different account here."));

  await db.user.update({ where: { id: userId }, data: { humanVerifiedAt: new Date(), idmeHash: hash } });
  return back("ok=" + encodeURIComponent("Recorded: you are attested as one distinct person. It counts as one extra vouch toward verification."));
}
