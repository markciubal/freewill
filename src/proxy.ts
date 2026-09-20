import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, originOfUrlTemplate } from "@/lib/security";

// Runs before every page render: mints a fresh nonce, writes the
// Content-Security-Policy that names it, and hands the nonce to Next.js
// through the x-nonce request header so the framework can stamp it on the
// scripts it emits. Every page here is rendered per request (they all read
// the session cookie), which is what per-request nonces require.

const TILE_ORIGIN = originOfUrlTemplate(process.env.NEXT_PUBLIC_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
const MAP_DATA_ORIGIN = originOfUrlTemplate(process.env.NEXT_PUBLIC_PMTILES_URL);

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
    tileOrigin: TILE_ORIGIN,
    mapDataOrigin: MAP_DATA_ORIGIN,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
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
