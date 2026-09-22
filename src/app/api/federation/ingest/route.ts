import { NextResponse, type NextRequest } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { BUNDLE_MAX_BYTES, ingestBundle, readCapped } from "@/lib/federation";
import { clientAddressKey, rateLimitPermits, recordAttempt } from "@/lib/ratelimit";
import { addressLimit, rateLimitMessage } from "@/lib/security";

// Take in another node's signed bundle. Two ways in:
//   - a node pushes it as JSON (sendToPeer in src/lib/federation.ts); the
//     answer is JSON: { outcome, message, counts };
//   - a member brings it as a file from the Other nodes page (a form upload);
//     the answer sends them back to the page with what happened.
// Either way the signature decides. It is taken in only when it is signed by
// a node that enough verified members here trust, so delivering a bundle
// gives the one who delivers it no power at all.

function back(path: string, key: "ok" | "error", message: string) {
  const sep = path.includes("?") ? "&" : "?";
  return new NextResponse(null, { status: 303, headers: { location: `${path}${sep}${key}=${encodeURIComponent(message)}` } });
}

export async function POST(request: NextRequest) {
  const isUpload = (request.headers.get("content-type") ?? "").startsWith("multipart/form-data");
  const address = await clientAddressKey();
  const permitted = await rateLimitPermits("ingest", [{ key: address, limit: addressLimit(address, "ingestPerAddress") }]);
  if (!permitted.allowed) {
    const message = rateLimitMessage(permitted.limit);
    return isUpload ? back("/nodes", "error", message) : NextResponse.json({ outcome: "refused", message }, { status: 429 });
  }
  await recordAttempt("ingest", [address]);

  const declared = Number(request.headers.get("content-length"));
  const tooLarge = "That bundle is too large to take in.";

  if (isUpload) {
    const userId = await getSessionUserId();
    if (!userId) return back("/login", "error", "Sign in to bring in a bundle.");
    // Browsers always say how large an upload is; refuse one that does not
    // rather than read an unknown amount.
    if (!Number.isFinite(declared) || declared <= 0) return back("/nodes", "error", "The upload did not say how large it is. Try again.");
    if (declared > BUNDLE_MAX_BYTES) return back("/nodes", "error", tooLarge);
    const file = (await request.formData()).get("bundle");
    if (!(file instanceof File) || file.size === 0) return back("/nodes", "error", "Choose a bundle file to bring in.");
    const result = await ingestBundle(await file.text(), "file", userId);
    return back(result.peerId ? `/nodes/${result.peerId}` : "/nodes", result.outcome === "refused" ? "error" : "ok", result.message);
  }

  if (declared > BUNDLE_MAX_BYTES) return NextResponse.json({ outcome: "refused", message: tooLarge }, { status: 413 });
  const text = await readCapped(request.body, BUNDLE_MAX_BYTES);
  if (text === null) return NextResponse.json({ outcome: "refused", message: tooLarge }, { status: 413 });
  const result = await ingestBundle(text, "push", null);
  return NextResponse.json({ outcome: result.outcome, message: result.message, counts: result.counts ?? null }, { status: result.status });
}
