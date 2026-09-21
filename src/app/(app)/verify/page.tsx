"use client";

import { useActionState } from "react";
import { Badge, Button, Card, Field, PageTitle, Textarea } from "@/components/ui";
import { verifyBundle, type VerifyResult } from "./actions";

export default function VerifyPage() {
  const [state, action, pending] = useActionState<VerifyResult, FormData>(verifyBundle, { done: false });
  const r = state.result;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle
        title="Verify the ledger"
        subtitle="Download the ledger from the Ledger page, then check it here or on any other machine. This re-derives the whole hash chain from the exported bundle and confirms it matches the commons-signed root. It trusts nothing but the public key inside the file."
      />
      <Card>
        <form action={action} className="space-y-3">
          <Field label="Paste an exported ledger bundle (JSON)">
            <Textarea name="bundle" rows={8} required placeholder='{ "version": 1, "checkpoint": { ... }, "entries": [ ... ] }' className="font-mono text-xs" />
          </Field>
          <Button type="submit" disabled={pending}>{pending ? "Checking..." : "Verify"}</Button>
        </form>
      </Card>

      {state.error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}

      {r && (
        <Card className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge tone={r.ok ? "accent" : "danger"}>{r.ok ? "verified" : "failed"}</Badge>
            <span className="text-sm">{r.ok ? "The bundle is internally consistent and signed by the commons." : `This bundle does not verify: ${r.reason ?? "it could not be checked"}.`}</span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-xs text-muted">Entries</dt><dd className="tabular-nums">{r.count}</dd></div>
            <div><dt className="text-xs text-muted">Root</dt><dd className="break-all font-mono text-xs">{r.root.slice(0, 24)}…</dd></div>
            {r.brokenAt !== null && <div><dt className="text-xs text-muted">Broke at entry</dt><dd className="text-danger">{r.brokenAt}</dd></div>}
          </dl>
        </Card>
      )}
    </div>
  );
}
