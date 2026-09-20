"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerPublicKey, removePublicKey } from "@/app/(app)/keys/actions";
import { generateIdentity, isPrivateKey, keyFingerprint, publicKeyOf } from "@/lib/keys";
import { setLocalIdentity, useLocalIdentity } from "./use-local-identity";
import { Badge, Button, SectionTitle } from "./ui";

// The private key lives here, on the device, in localStorage. It is generated
// on this machine, shown once to back up, and never sent to the server. Losing
// it (with no backup) means losing the ability to sign, exactly like a cash
// note secret. This is the honest cost of self-custody.

export function IdentityKeys({ registeredPublicKey }: { registeredPublicKey: string | null }) {
  const router = useRouter();
  const local = useLocalIdentity();
  const [reveal, setReveal] = useState(false);
  const [importVal, setImportVal] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);

  const localPub = local ? publicKeyOf(local) : null;
  const matches = !!(local && registeredPublicKey && localPub === registeredPublicKey);

  async function register(priv: string) {
    setBusy(true);
    setMsg({});
    try {
      setLocalIdentity(priv);
      const res = await registerPublicKey(publicKeyOf(priv));
      setMsg(res);
      if (!res.error) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setReveal(true);
    await register(generateIdentity().privateKey);
  }

  async function importKey() {
    const v = importVal.trim().toLowerCase();
    if (!isPrivateKey(v)) {
      setMsg({ error: "That is not a valid backup key (64 hex characters)." });
      return;
    }
    await register(v);
    setImportVal("");
  }

  async function remove() {
    const res = await removePublicKey();
    setMsg(res);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <SectionTitle>Your identity key</SectionTitle>

      {registeredPublicKey ? (
        <p className="text-sm">
          <Badge tone={matches ? "accent" : local ? "warn" : "neutral"}>
            {matches ? "active on this device" : local ? "different key on this device" : "not on this device"}
          </Badge>{" "}
          <span className="font-mono text-xs text-muted">{keyFingerprint(registeredPublicKey)}</span>
        </p>
      ) : (
        <p className="text-sm text-muted">You have no identity key yet. Create one to sign your vouches so no one can forge or claim them.</p>
      )}

      {msg.error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{msg.error}</p>}
      {msg.ok && <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">{msg.ok}</p>}

      {!local && !registeredPublicKey && (
        <Button type="button" onClick={create} disabled={busy}>{busy ? "Creating..." : "Create my identity key"}</Button>
      )}

      {local && reveal && (
        <div className="rounded-md border-2 border-danger/50 bg-card p-3">
          <div className="text-xs font-medium text-danger">Back this up now. It is your private key and it is only on this device. If you lose it, you lose the ability to sign.</div>
          <div className="mt-1 break-all rounded border border-border bg-background p-2 font-mono text-xs">{local}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => navigator.clipboard?.writeText(local)}>Copy</Button>
            <Button type="button" variant="ghost" onClick={() => setReveal(false)}>I&apos;ve written it down</Button>
          </div>
        </div>
      )}

      {local && !reveal && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">This device holds a key</span>
          <span className="font-mono text-xs">{keyFingerprint(localPub!)}</span>
          <Button type="button" variant="ghost" onClick={() => setReveal(true)}>Show backup</Button>
          {registeredPublicKey && !matches && (
            <Button type="button" onClick={() => register(local)} disabled={busy}>Use this device&apos;s key on my account</Button>
          )}
        </div>
      )}

      {registeredPublicKey && !matches && (
        <div className="rounded-md border border-border p-3">
          <div className="mb-1 text-sm font-medium">Sign on this device</div>
          <p className="mb-2 text-xs text-muted">Paste your backup key to sign here. It is stored only on this device.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={importVal}
              onChange={(e) => setImportVal(e.target.value)}
              placeholder="64 hex characters"
              className="w-72 max-w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
            />
            <Button type="button" onClick={importKey} disabled={busy}>Load key</Button>
          </div>
        </div>
      )}

      {registeredPublicKey && (
        <Button type="button" variant="ghost" onClick={remove}>Remove identity key from my account</Button>
      )}
    </div>
  );
}
