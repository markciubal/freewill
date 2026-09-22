import { NextResponse } from "next/server";
import { BUNDLE_FORMAT, BUNDLE_VERSION, nodePublicKey } from "@/lib/federation";
import { keyFingerprint } from "@/lib/keys";

// Public: this node's key and where its bundle is. A member of another node
// uses it to check that the address they were given answers with the key they
// were read out. It says nothing about any person.
export async function GET() {
  const publicKey = nodePublicKey();
  return NextResponse.json({
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    publicKey,
    fingerprint: keyFingerprint(publicKey),
    bundle: "/api/federation/bundle",
    ingest: "/api/federation/ingest",
  });
}
