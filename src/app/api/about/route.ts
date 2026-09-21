import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { MANIFEST } from "@/lib/manifest";
import { LIVE_STATE, loadLiveState } from "@/lib/manifest.live";

// The app's self-description as JSON, so another node, a researcher, or a
// machine can read what this software claims and go check it. The claims
// themselves are public on purpose: they are what the project says about
// itself in the open, and a claim nobody can fetch is a claim nobody can hold
// you to.
//
// ?live=1 attaches the aggregate figures the questions quote, and needs a
// session. They name nobody, but how many people are here and where is still
// the community's business rather than an anonymous caller's.

export async function GET(request: Request) {
  const wantsLive = new URL(request.url).searchParams.get("live") === "1";
  const live = wantsLive && (await getSessionUserId())
    ? Object.fromEntries(await Promise.all(Object.keys(LIVE_STATE).map(async (key) => [key, (await loadLiveState([key]))[0] ?? null])))
    : undefined;

  return NextResponse.json(
    {
      ...MANIFEST,
      generatedAt: new Date().toISOString(),
      liveStateKeys: Object.keys(LIVE_STATE),
      ...(live ? { live } : {}),
      ...(wantsLive && !live ? { live: null, liveNote: "Sign in to read the live figures. The claims above are public; the community's numbers are not." } : {}),
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
