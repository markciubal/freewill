import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { idmeConfig, idmePolicies, publicOrigin } from "@/lib/idme";
import { arrivedHereByOnion } from "@/lib/onion.server";

// Step 1 of the optional ID.me verification: send the signed-in person to
// ID.me to prove one affiliation (?policy=nurse|responder|...). The policy
// handle is the OAuth scope. Does nothing unless the deployment enables it.
export async function GET(request: Request) {
  const origin = publicOrigin(request);
  const cfg = idmeConfig();
  if (!cfg) return NextResponse.redirect(new URL("/profile?error=" + encodeURIComponent("ID.me is not enabled here."), origin));
  // ID.me returns people to the regular address, where a login made through
  // the onion address does not exist, and ID.me learns who you are anyway.
  if (await arrivedHereByOnion()) return NextResponse.redirect(new URL("/profile?error=" + encodeURIComponent("ID.me verification only works at the regular address, not the onion address. ID.me checks your legal identity, so Tor cannot hide you from it anyway."), origin));
  if (!(await getSessionUserId())) return NextResponse.redirect(new URL("/login", origin));

  const requested = new URL(request.url).searchParams.get("policy");
  const policy = idmePolicies().find((p) => p.handle === requested);
  if (!policy) return NextResponse.redirect(new URL("/profile?error=" + encodeURIComponent("Choose a verification to add."), origin));

  const state = randomBytes(16).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const jar = await cookies();
  jar.set("idme_oauth", JSON.stringify({ state, verifier, policy: policy.handle }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });

  const url = new URL(`${cfg.apiBase}/oauth/authorize`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", policy.handle);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return NextResponse.redirect(url);
}
