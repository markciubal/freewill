import "server-only";
import { createHmac } from "node:crypto";

// Optional ID.me affiliation verification, off unless a deployment sets
// IDME_ENABLED=true. This is attestation, not login: nobody signs in with it,
// and it gates nothing. Its single standing effect is one extra vouch toward
// local verification. We keep only a date, an HMAC of the ID.me subject id
// (so one legal identity cannot verify many accounts), and which affiliations
// were confirmed - never a name, birthdate, or document. Be honest in the UI:
// ID.me itself keeps a record linking the person's legal identity here.

// Pure, client-safe helpers live in ./idme.shared and are re-exported so app
// code can keep importing everything from "@/lib/idme". Only the secret-using
// function below stays behind the server-only guard.
export * from "./idme.shared";

// A stable one-way handle for "this legal identity, in this deployment".
export function idmeSubjectHash(subject: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set");
  return createHmac("sha256", secret).update(`idme:${subject}`).digest("hex");
}
