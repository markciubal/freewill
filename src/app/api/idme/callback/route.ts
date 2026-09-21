import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { decodeJwtPayload, extractAffiliations, extractSubject, idmeConfig, idmePolicies, idmeSubjectHash, policyLabel, publicOrigin } from "@/lib/idme";

// Step 2: ID.me sends the person back with a code. Exchange it, take only a
// stable subject id, and record { humanVerifiedAt, HMAC(subject) }. One legal
// identity can attest for one account, enforced here before writing.
export async function GET(request: Request) {
  const origin = publicOrigin(request);
  const back = (q: string) => NextResponse.redirect(new URL(`/profile?${q}`, origin));
  const cfg = idmeConfig();
  if (!cfg) return back("error=" + encodeURIComponent("ID.me is not enabled here."));
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", origin));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const errDesc = url.searchParams.get("error_description");
  const jar = await cookies();
  const saved = jar.get("idme_oauth")?.value;
  jar.delete("idme_oauth");
  let parsed: { state?: string; verifier?: string; policy?: string } = {};
  try { parsed = JSON.parse(saved ?? "{}"); } catch {}
  // Distinguish the failure modes so a retry can be diagnosed, not guessed at.
  if (err) {
    // ID.me told us why it sent no code (e.g. access_denied, invalid_scope).
    return back("error=" + encodeURIComponent(`ID.me declined (${err}${errDesc ? `: ${decodeURIComponent(errDesc)}` : ""}). Nothing was recorded.`));
  }
  if (!saved) {
    return back("error=" + encodeURIComponent("Your browser didn't return the sign-in cookie. Start and finish on the same address (the public site, not a forwarded or preview URL), and allow cookies. Nothing was recorded."));
  }
  if (!code || !state) {
    return back("error=" + encodeURIComponent("ID.me sent no code and no error. Check the app's scope/policy in the ID.me portal. Nothing was recorded."));
  }
  if (state !== parsed.state) {
    return back("error=" + encodeURIComponent("The security check (state) didn't match. Nothing was recorded; try again."));
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

  const idPayload = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null;
  let subject = extractSubject(idPayload, null);
  let attrs: unknown = null;
  if (tokens.access_token) {
    const at = await fetch(`${cfg.apiBase}/api/public/v3/attributes.json?access_token=${encodeURIComponent(tokens.access_token)}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (at?.ok) {
      const j = (await at.json()) as { attributes?: unknown };
      attrs = j.attributes ?? j;
      if (!subject) subject = extractSubject(null, attrs);
    }
  }
  if (!subject) return back("error=" + encodeURIComponent("ID.me returned no stable identity. Nothing was recorded."));

  // One legal identity attests for at most one account here.
  const hash = idmeSubjectHash(subject);
  const taken = await db.user.findFirst({ where: { idmeHash: hash, id: { not: userId } }, select: { id: true } });
  if (taken) return back("error=" + encodeURIComponent("That identity already verifies a different account here."));

  // Which affiliations were confirmed: the one we asked for (ID.me only returns
  // a code on success), plus any the response explicitly reports, kept to the
  // policies this deployment enables.
  const enabled = new Set(idmePolicies().map((p) => p.handle));
  const confirmed = new Set<string>();
  if (parsed.policy && enabled.has(parsed.policy)) confirmed.add(parsed.policy);
  for (const g of extractAffiliations(idPayload, attrs)) if (enabled.has(g)) confirmed.add(g);
  if (confirmed.size === 0) return back("error=" + encodeURIComponent("ID.me confirmed no affiliation this deployment offers. Nothing was recorded."));

  const current = await db.user.findUnique({ where: { id: userId }, select: { affiliations: true, humanVerifiedAt: true } });
  const merged = [...new Set([...(current?.affiliations ?? []), ...confirmed])];
  await db.user.update({
    where: { id: userId },
    data: { humanVerifiedAt: current?.humanVerifiedAt ?? new Date(), idmeHash: hash, affiliations: merged },
  });
  const added = [...confirmed].map(policyLabel).join(", ");
  return back("ok=" + encodeURIComponent(`Verified via ID.me: ${added}. It shows on your profile and counts as one extra vouch toward verification.`));
}
