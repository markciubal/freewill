"use server";

import { requireUser } from "@/lib/auth";
import { type BundleVerification, type LedgerBundle, verifyExportedBundle } from "@/lib/checkpoint";

export type VerifyResult = { done: boolean; result?: BundleVerification; error?: string };

// Verify a pasted ledger bundle. This needs no database and trusts nothing but
// the public key inside the bundle; the same check runs on any machine.
export async function verifyBundle(_prev: VerifyResult, formData: FormData): Promise<VerifyResult> {
  await requireUser();
  const raw = formData.get("bundle");
  if (typeof raw !== "string" || !raw.trim()) return { done: false, error: "Paste an exported ledger bundle." };
  let bundle: LedgerBundle;
  try {
    bundle = JSON.parse(raw);
  } catch {
    return { done: false, error: "That is not valid JSON." };
  }
  if (!bundle || typeof bundle !== "object" || !bundle.checkpoint || !Array.isArray(bundle.entries)) {
    return { done: false, error: "That JSON is not a ledger bundle (missing checkpoint or entries)." };
  }
  return { done: true, result: verifyExportedBundle(bundle) };
}
