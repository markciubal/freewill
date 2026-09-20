"use client";

import QRCode from "qrcode";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { mintCash } from "@/app/(app)/cash/actions";
import { CASH_DENOMINATIONS, commitmentInput, noteToken } from "@/lib/cash";
import { Button, SectionTitle } from "./ui";

// Minting happens here, in the browser. The secret is generated with the
// device's own randomness and hashed with WebCrypto; only the resulting
// commitment is sent to the server. The secret is shown once, to write down or
// print, and never leaves this page. Lose it and the value is gone - like cash.

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

type Minted = { denomination: number; secret: string; token: string; qr: string };

export function MintCash() {
  const router = useRouter();
  const [denomination, setDenomination] = useState<number>(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [minted, setMinted] = useState<Minted | null>(null);

  async function mint() {
    setBusy(true);
    setError("");
    setMinted(null);
    try {
      const secretBytes = new Uint8Array(32);
      crypto.getRandomValues(secretBytes);
      const secret = toHex(secretBytes);
      const commitment = await sha256Hex(commitmentInput(denomination, secret));

      const fd = new FormData();
      fd.set("denomination", String(denomination));
      fd.set("commitment", commitment);
      const res = await mintCash(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      const token = noteToken(denomination, secret);
      const qr = await QRCode.toDataURL(token, { margin: 1, errorCorrectionLevel: "M", width: 220 });
      setMinted({ denomination, secret, token, qr });
      router.refresh();
    } catch {
      setError("Something went wrong minting the note. Nothing was recorded; try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <SectionTitle>Mint a cash note</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {CASH_DENOMINATIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDenomination(d)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium tabular-nums ${denomination === d ? "border-accent bg-accent text-accent-foreground" : "border-border hover:bg-border/40"}`}
          >
            {d}
          </button>
        ))}
      </div>
      <Button type="button" onClick={mint} disabled={busy}>
        {busy ? "Minting..." : `Mint a ${denomination} Grace note`}
      </Button>
      {error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {minted && (
        <div className="rounded-xl border-2 border-accent bg-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted">Freewill cash note</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">{minted.denomination} Grace</div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={minted.qr} alt="Note QR" className="h-28 w-28" />
          </div>
          <div className="mt-3">
            <div className="text-xs font-medium text-danger">Write this down now. It is not stored anywhere. If you lose it, the value is gone.</div>
            <div className="mt-1 w-full break-all rounded-md border border-border bg-background p-2 font-mono text-xs">{minted.token}</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => navigator.clipboard?.writeText(minted.token)}>Copy</Button>
            <Button type="button" variant="ghost" onClick={() => window.print()}>Print</Button>
            <Button type="button" variant="ghost" onClick={() => setMinted(null)}>Done (hide it)</Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            The {minted.denomination} Grace has left your balance and is locked to this note. Whoever reveals the secret reclaims it - including you.
          </p>
        </div>
      )}
    </div>
  );
}
