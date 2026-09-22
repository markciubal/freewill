"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { castBallot } from "@/app/(app)/assemblies/actions";
import { ballotFingerprint, isBallotKey, newBallotKey, readRanking } from "@/lib/ballot-seal";
import { Button, Input, Select } from "./ui";

// A secret ballot, cast from this browser (see src/lib/ballot-seal.ts). The
// browser makes the ballot key, keeps it in this browser only, and sends the
// server nothing but its fingerprint. Showing the key again later is what lets
// you change your ballot; without it nobody, including the server, can say
// which sealed ballot is yours.

const STORE = "fw_ballots"; // { [questionId]: { key, ranking } }
const CHANGE = "fw_ballots_change";

type Kept = { key: string; ranking: number[] };

function readAll(): Record<string, Kept> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Kept>) : {};
  } catch {
    return {};
  }
}

// A string, not an object, so React sees the same snapshot until it changes.
function readOne(questionId: string): string | null {
  const kept = readAll()[questionId];
  return kept && typeof kept.key === "string" && isBallotKey(kept.key) && Array.isArray(kept.ranking) ? JSON.stringify(kept) : null;
}

function keep(questionId: string, kept: Kept | null) {
  try {
    const all = readAll();
    if (kept) all[questionId] = kept;
    else delete all[questionId];
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    // A private window may refuse storage. The ballot still counts; it just
    // cannot be changed from this browser.
  }
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}

// The form shows ranks (1 = first choice) per option; the ballot stores option
// indices in order of preference. These turn one into the other.
function ranksFrom(ranking: number[], optionCount: number): string[] {
  const ranks = Array.from({ length: optionCount }, () => "");
  ranking.forEach((option, index) => {
    if (option >= 0 && option < optionCount) ranks[option] = String(index + 1);
  });
  return ranks;
}

export function BallotForm({ questionId, options, hasVoted }: { questionId: string; options: string[]; hasVoted: boolean }) {
  const router = useRouter();
  const keptRaw = useSyncExternalStore(subscribe, () => readOne(questionId), () => null);
  const kept = useMemo<Kept | null>(() => (keptRaw ? (JSON.parse(keptRaw) as Kept) : null), [keptRaw]);
  const [edited, setEdited] = useState<string[] | null>(null);
  const [pastedKey, setPastedKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});

  const ranks = edited ?? (hasVoted && kept ? ranksFrom(kept.ranking, options.length) : ranksFrom([], options.length));
  const changing = hasVoted && !!kept;

  async function submit() {
    setMessage({});
    const read = readRanking(options.length, (option) => ranks[option]);
    if ("error" in read) {
      setMessage({ error: read.error });
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      ranks.forEach((rank, option) => rank && form.set(`rank_${option}`, rank));
      if (changing) {
        form.set("ballotKey", kept.key);
      } else {
        // Keep the key before sending, so a ballot that reaches the server is
        // never left without its key if the page is closed mid-way.
        const key = newBallotKey();
        keep(questionId, { key, ranking: read.ranking });
        form.set("fingerprint", ballotFingerprint(key));
      }
      const outcome = await castBallot(questionId, form);
      if ("error" in outcome) {
        if (!changing) keep(questionId, null);
        setMessage({ error: outcome.error });
        return;
      }
      if (changing) keep(questionId, { key: kept.key, ranking: read.ranking });
      setEdited(null);
      setMessage({ ok: outcome.ok });
      router.refresh();
    } catch {
      if (!changing) keep(questionId, null);
      setMessage({ error: "The ballot did not reach the server. Nothing was recorded; try again." });
    } finally {
      setBusy(false);
    }
  }

  function acceptPastedKey() {
    const key = pastedKey.trim().toLowerCase();
    if (!isBallotKey(key)) {
      setMessage({ error: "That is not a ballot key. It is 64 letters and numbers." });
      return;
    }
    keep(questionId, { key, ranking: [] });
    setPastedKey("");
    setMessage({ ok: "Key added. Rank the options again and press Change ballot." });
  }

  return (
    <div className="space-y-3">
      <noscript>
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          Voting needs JavaScript, because your browser seals the ballot itself. In Tor Browser, set the security level to Safer or Standard for this page.
        </p>
      </noscript>

      {hasVoted && !kept ? (
        <div className="space-y-2 text-sm">
          <p>
            You have voted. Your ballot is sealed, and the key that opens it is not in this browser, so it cannot be changed from here. Your ballot still counts.
          </p>
          <details>
            <summary className="cursor-pointer text-accent">I saved my ballot key</summary>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <Input value={pastedKey} onChange={(event) => setPastedKey(event.target.value)} placeholder="64 letters and numbers" className="min-w-60 flex-1 font-mono text-xs" aria-label="Ballot key" />
              <Button type="button" variant="ghost" onClick={acceptPastedKey}>Use this key</Button>
            </div>
          </details>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">Give your first choice rank 1, your second rank 2, and so on. Leave an option blank if you could not accept it at all.</p>
          {options.map((option, index) => (
            <label key={index} className="flex items-center gap-3 text-sm">
              <span className="w-16 shrink-0">
                <Select
                  value={ranks[index]}
                  onChange={(event) => setEdited(ranks.map((rank, i) => (i === index ? event.target.value : rank)))}
                  aria-label={`Rank for ${option}`}
                >
                  <option value="">-</option>
                  {options.map((_, rank) => (
                    <option key={rank} value={rank + 1}>{rank + 1}</option>
                  ))}
                </Select>
              </span>
              <span>{option}</span>
            </label>
          ))}
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? "Sealing..." : changing ? "Change ballot" : "Cast ballot"}
          </Button>
          <p className="text-xs text-muted">
            Your ballot is secret. This browser seals it with a key that stays here; the records hold who voted and, separately, what was chosen, with nothing joining the two.
          </p>
        </>
      )}

      {/* Said aloud as well as shown, like every other form's notice: a
          refusal interrupts, a sealed ballot is announced politely. */}
      {message.error && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{message.error}</p>}
      {message.ok && <p role="status" className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm">{message.ok}</p>}

      {changing && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Your ballot key</summary>
          <p className="mt-1">Keep it somewhere safe if you might change your ballot from another device. Anyone holding it could change your ballot, and it cannot be recovered.</p>
          <p className="mt-1 break-all font-mono text-foreground">{kept.key}</p>
        </details>
      )}
    </div>
  );
}
