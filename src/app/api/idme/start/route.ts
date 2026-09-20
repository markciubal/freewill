import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { idmeConfig } from "@/lib/idme";

// Step 1 of the optional ID.me attestation: send the signed-in person to
// ID.me with state + PKCE. Does nothing unless the deployment enables it.
export async function GET(request: Request) {
  const cfg = idmeConfig();
  if (!cfg) return NextResponse.redirect(new URL("/profile?error=" + encodeURIComponent("ID.me is not enabled here."), request.url));
  if (!(await getSessionUserId())) return NextResponse.redirect(new URL("/login", request.url));

  const state = randomBytes(16).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const jar = await cookies();
  jar.set("idme_oauth", JSON.stringify({ state, verifier }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });

  const url = new URL(`${cfg.apiBase}/oauth/authorize`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return NextResponse.redirect(url);
}
