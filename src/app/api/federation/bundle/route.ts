import { NextResponse, type NextRequest } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { NODE_HEADER, buildNodeBundle, peerFromRequest } from "@/lib/federation";

// This node's signed bundle. Two kinds of caller:
//   - a signed-in member, who downloads it as a file to carry to another node;
//   - another node that members here trust, proving who it is with signed
//     headers (see signedRequestHeaders in src/lib/federation.ts).
// Nobody else gets it. `?from=N` sends the ledger history from entry N on,
// for a node that already holds the first N.
export async function GET(request: NextRequest) {
  const fromParam = request.nextUrl.searchParams.get("from");
  const from = fromParam && /^\d{1,9}$/.test(fromParam) ? Number(fromParam) : 0;

  if (request.headers.has(NODE_HEADER)) {
    const asking = await peerFromRequest(request.headers, "GET", request.nextUrl.pathname + request.nextUrl.search);
    if (!asking.ok) return NextResponse.json({ error: asking.error }, { status: asking.status });
    return NextResponse.json(await buildNodeBundle({ from }), { headers: { "cache-control": "no-store" } });
  }

  if (!(await getSessionUserId())) return NextResponse.json({ error: "Sign in first, or ask as a node this one trusts." }, { status: 401 });
  const bundle = await buildNodeBundle({ from });
  return new NextResponse(JSON.stringify(bundle), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="freewill-node-${bundle.at.slice(0, 10)}.json"`,
    },
  });
}
