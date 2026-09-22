import "server-only";
import { headers } from "next/headers";
import { arrivedByOnion, onionHostname } from "./onion";

// The configured onion address, read once.
export const ONION_HOST = onionHostname(process.env);

// Whether the request being handled now came in through the onion service
// (see arrivedByOnion in onion.ts for how that is told apart).
export async function arrivedHereByOnion(): Promise<boolean> {
  if (!ONION_HOST) return false;
  const requestHeaders = await headers();
  return arrivedByOnion({ host: requestHeaders.get("host"), forwardedFor: requestHeaders.get("x-forwarded-for") }, ONION_HOST);
}
