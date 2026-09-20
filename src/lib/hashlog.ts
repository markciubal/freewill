import { sha256 } from "@noble/hashes/sha2.js";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

// The tamper-evident ledger. Every economic event is appended to a hash chain:
// entry.hash = sha256(prevHash + payloadHash), where payloadHash commits to the
// underlying record. Editing any past transfer changes its payloadHash, which
// breaks that entry's hash and every hash after it, moving the root. So the
// root is a fingerprint of the entire history; publish it (or just remember it)
// and later tampering is evident. This is not consensus and not anti-forgery of
// new writes - it is integrity of the record over time, checkable by anyone.

export const GENESIS = "0".repeat(64);
export type LogKind = "TRANSFER" | "ADJUSTMENT" | "VOUCHER_ISSUE" | "VOUCHER_REDEEM" | "CASH_MINT" | "CASH_REDEEM";

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function h(s: string) {
  return hex(sha256(new TextEncoder().encode(s)));
}

// Canonical, stable serialization of an event. Field order is fixed here, never
// derived from object key order, so the hash is reproducible anywhere.
export function payloadHashOf(kind: LogKind, rec: Record<string, unknown>): string {
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  let parts: string[];
  if (kind === "TRANSFER") {
    parts = ["T", str(rec.ledger), str(rec.fromId), str(rec.toId), str(rec.amount), str(rec.memo), str(rec.listingId), iso(rec.createdAt)];
  } else if (kind === "ADJUSTMENT") {
    parts = ["A", str(rec.userId), str(rec.ledger), str(rec.amount), str(rec.reason), str(rec.runId), iso(rec.createdAt)];
  } else if (kind === "VOUCHER_ISSUE") {
    parts = ["VI", str(rec.issuerId), str(rec.ledger), str(rec.amount), str(rec.nonce), str(rec.signature), iso(rec.createdAt)];
  } else if (kind === "VOUCHER_REDEEM") {
    parts = ["VR", str(rec.id), str(rec.redeemedById), iso(rec.redeemedAt)];
  } else if (kind === "CASH_MINT") {
    parts = ["CM", str(rec.minterId), str(rec.ledger), str(rec.denomination), str(rec.commitment), iso(rec.createdAt)];
  } else {
    parts = ["CR", str(rec.id), str(rec.spentById), iso(rec.spentAt)];
  }
  return h(parts.join("\u0000"));
}

export function entryHash(prevHash: string, payloadHash: string): string {
  return h(`${prevHash}\u0000${payloadHash}`);
}

type TxClient = Prisma.TransactionClient;

// Append one event to the chain. Call inside the same transaction as the record
// it commits to, so the log and the record land together.
export async function appendLog(tx: TxClient, kind: LogKind, refId: string, rec: Record<string, unknown>): Promise<string> {
  const prev = await tx.ledgerLog.findFirst({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { hash: true } });
  const prevHash = prev?.hash ?? GENESIS;
  const payloadHash = payloadHashOf(kind, rec);
  const hash = entryHash(prevHash, payloadHash);
  await tx.ledgerLog.create({ data: { kind, refId, payloadHash, prevHash, hash } });
  return hash;
}

export type LedgerVerification = {
  ok: boolean;
  count: number;
  root: string; // last entry's hash, or GENESIS if empty
  brokenAt: number | null; // index of the first bad entry
  reason?: string;
};

// Recompute the whole chain from the underlying records and confirm every link.
// Detects both an edited economic record (payloadHash mismatch) and an edited
// log entry (chain hash mismatch).
export async function verifyLedger(): Promise<LedgerVerification> {
  const logs = await db.ledgerLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  let prevHash = GENESIS;
  for (let i = 0; i < logs.length; i++) {
    const e = logs[i];
    const rec = await fetchRecord(e.kind as LogKind, e.refId);
    const expectedPayload = rec ? payloadHashOf(e.kind as LogKind, rec) : null;
    if (expectedPayload !== e.payloadHash) {
      return { ok: false, count: logs.length, root: prevHash, brokenAt: i, reason: rec ? "a recorded event was altered" : "a recorded event is missing" };
    }
    if (e.prevHash !== prevHash || entryHash(prevHash, e.payloadHash) !== e.hash) {
      return { ok: false, count: logs.length, root: prevHash, brokenAt: i, reason: "the chain link was altered" };
    }
    prevHash = e.hash;
  }
  return { ok: true, count: logs.length, root: prevHash, brokenAt: null };
}

// Cheap current root from stored hashes, for display. verifyLedger does the
// real check; this just reads the tail.
export async function ledgerRoot(): Promise<{ root: string; count: number }> {
  const [tail, count] = await Promise.all([
    db.ledgerLog.findFirst({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { hash: true } }),
    db.ledgerLog.count(),
  ]);
  return { root: tail?.hash ?? GENESIS, count };
}

async function fetchRecord(kind: LogKind, refId: string): Promise<Record<string, unknown> | null> {
  if (kind === "TRANSFER") return db.transfer.findUnique({ where: { id: refId } });
  if (kind === "ADJUSTMENT") return db.ledgerAdjustment.findUnique({ where: { id: refId } });
  if (kind === "VOUCHER_ISSUE" || kind === "VOUCHER_REDEEM") return db.voucher.findUnique({ where: { id: refId } });
  if (kind === "CASH_MINT" || kind === "CASH_REDEEM") return db.cashNote.findUnique({ where: { id: refId } });
  return null;
}

// Append log entries for any transfers/adjustments not yet in the chain, in
// time order. Safe to run repeatedly; only appends what is missing.
export async function backfillLog(): Promise<{ added: number }> {
  const logged = new Set((await db.ledgerLog.findMany({ select: { refId: true } })).map((l) => l.refId));
  const [transfers, adjustments] = await Promise.all([
    db.transfer.findMany({ orderBy: { createdAt: "asc" } }),
    db.ledgerAdjustment.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  const events = [
    ...transfers.map((t) => ({ kind: "TRANSFER" as const, id: t.id, at: t.createdAt, rec: t as unknown as Record<string, unknown> })),
    ...adjustments.map((a) => ({ kind: "ADJUSTMENT" as const, id: a.id, at: a.createdAt, rec: a as unknown as Record<string, unknown> })),
  ]
    .filter((e) => !logged.has(e.id))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  let added = 0;
  for (const e of events) {
    await db.$transaction(async (tx) => {
      await appendLog(tx, e.kind, e.id, e.rec);
    });
    added++;
  }
  return { added };
}
