import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import type { TrustBundle } from "@/lib/keys";

// Download the signed web of trust: public keys and signed vouches. Another
// node can verify every vouch itself with only these public keys (see
// verifyTrustBundle) — no need to trust this server. Reveals no balances,
// notes, or private data, only who has publicly vouched for whom.
export async function GET() {
  if (!(await getSessionUserId())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const [members, vouches] = await Promise.all([
    db.user.findMany({ where: { publicKey: { not: null } }, select: { id: true, username: true, publicKey: true } }),
    db.vouch.findMany({ where: { signature: { not: null } }, select: { fromId: true, toId: true, signature: true } }),
  ]);
  const bundle: TrustBundle = {
    version: 1,
    members: members.map((m) => ({ id: m.id, username: m.username, publicKey: m.publicKey! })),
    vouches: vouches.map((v) => ({ fromId: v.fromId, toId: v.toId, signature: v.signature! })),
  };
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="freewill-trust-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
