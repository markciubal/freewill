import { NextResponse, type NextRequest } from "next/server";
import { arrivedByOnion, onionHostname, onionLocation } from "@/lib/onion";
import { buildContentSecurityPolicy, originOfUrlTemplate } from "@/lib/security";

// Runs before every page render: mints a fresh nonce, writes the
// Content-Security-Policy that names it, and hands the nonce to Next.js
// through the x-nonce request header so the framework can stamp it on the
// scripts it emits. Every page here is rendered per request (they all read
// the session cookie), which is what per-request nonces require.
//
// With an onion address configured (ONION_HOSTNAME, docs/onion.md), it also
// tells the two ways in apart: a visit through Tor gets a policy that does not
// upgrade its plain http, and a visit to the regular address gets an
// Onion-Location header, which makes Tor Browser offer the onion address.

const TILE_ORIGIN = originOfUrlTemplate(process.env.NEXT_PUBLIC_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
const MAP_DATA_ORIGIN = originOfUrlTemplate(process.env.NEXT_PUBLIC_PMTILES_URL);
const ONION_HOST = onionHostname(process.env);

export function proxy(request: NextRequest) {
  const viaOnion = arrivedByOnion({ host: request.headers.get("host"), forwardedFor: request.headers.get("x-forwarded-for") }, ONION_HOST);
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
    tileOrigin: TILE_ORIGIN,
    mapDataOrigin: MAP_DATA_ORIGIN,
    plainHttp: viaOnion,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  if (ONION_HOST && !viaOnion) response.headers.set("Onion-Location", onionLocation(ONION_HOST, request.nextUrl.pathname + request.nextUrl.search));
  return response;
}

export const config = {
  // Pages only. Static assets, the image optimizer, and API routes carry no
  // inline scripts and need no nonce. Prefetches are skipped as Next.js advises.
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|map/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
