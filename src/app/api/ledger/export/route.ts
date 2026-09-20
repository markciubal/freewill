import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { exportLedger } from "@/lib/checkpoint";

// Download the signed, portable ledger bundle. Carry it to another machine and
// verify it with nothing but the commons public key (see /verify).
export async function GET() {
  if (!(await getSessionUserId())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const bundle = await exportLedger();
  const stamp = bundle.checkpoint.at.slice(0, 10);
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="freewill-ledger-${stamp}.json"`,
    },
  });
}
