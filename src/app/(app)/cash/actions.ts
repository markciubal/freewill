"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { CASH_MAX, CASH_MIN, commitmentOf, denominationCents, isCommitment, isDenomination, parseNoteToken } from "@/lib/cash";
import { db } from "@/lib/db";
import { fail, ok, str } from "@/lib/form";
import { appendLog } from "@/lib/hashlog";
import { getStanding } from "@/lib/standing.all";

class CashError extends Error {}

// Mint a note. The browser generated the secret and the commitment; the server
// receives ONLY the commitment, so it never learns the secret and can never
// spend the note itself. The denomination is debited now (respecting the
// minter's standing limit) and locked to the commitment.
export async function mintCash(formData: FormData): Promise<{ error?: string; id?: string }> {
  const me = await requireUser();
  const denomination = Number(str(formData, "denomination"));
  const commitment = str(formData, "commitment")?.toLowerCase();
  if (!isDenomination(denomination)) return { error: `Denomination must be a whole number of Grace from ${CASH_MIN} to ${CASH_MAX}.` };
  if (!commitment || !isCommitment(commitment)) return { error: "That note's commitment is malformed. Try minting again." };

  const cents = denominationCents(denomination);
  const standing = await getStanding(me.id);
  try {
    const id = await db.$transaction(async (tx) => {
      const dupe = await tx.cashNote.findUnique({ where: { commitment }, select: { id: true } });
      if (dupe) throw new CashError("That note already exists. Mint a fresh one.");
      const u = await tx.user.findUniqueOrThrow({ where: { id: me.id }, select: { graceBalance: true } });
      if (u.graceBalance - cents < -standing.graceLimit) {
        throw new CashError("This note would take you below your Grace limit. Earn standing to extend it.");
      }
      await tx.user.update({ where: { id: me.id }, data: { graceBalance: { decrement: cents } } });
      const note = await tx.cashNote.create({ data: { minterId: me.id, ledger: "GRACE", denomination, commitment } });
      await appendLog(tx, "CASH_MINT", note.id, note as unknown as Record<string, unknown>);
      return note.id;
    });
    revalidatePath("/cash");
    return { id };
  } catch (e) {
    if (e instanceof CashError) return { error: e.message };
    throw e;
  }
}

// Reclaim/redeem: reveal the note (denomination + secret). The server hashes it,
// finds the matching unspent commitment, and credits the revealer. This works
// for anyone holding the paper, including the original minter reclaiming their
// own value. First valid reveal wins; a copy presented afterward is refused.
export async function redeemCash(formData: FormData) {
  const me = await requireUser();
  const token = str(formData, "token");
  if (!token) fail("/cash", "Write the note's denomination and secret to reclaim it.");
  const parsed = parseNoteToken(token);
  if (!parsed) fail("/cash", "That note could not be read. It should look like N1.10.<secret>.");
  const commitment = commitmentOf(parsed.denomination, parsed.secret);

  try {
    await db.$transaction(async (tx) => {
      const note = await tx.cashNote.findUnique({ where: { commitment } });
      if (!note || note.denomination !== parsed.denomination) throw new CashError("No unspent note matches that secret. It may be fake, mistyped, or already reclaimed.");
      if (note.status === "SPENT") throw new CashError("Already reclaimed. A note can only be reclaimed once.");
      await tx.user.update({ where: { id: me.id }, data: { graceBalance: { increment: denominationCents(note.denomination) } } });
      const spent = await tx.cashNote.update({ where: { id: note.id }, data: { status: "SPENT", spentById: me.id, spentAt: new Date() } });
      await appendLog(tx, "CASH_REDEEM", spent.id, spent as unknown as Record<string, unknown>);
    });
  } catch (e) {
    if (e instanceof CashError) fail("/cash", e.message);
    throw e;
  }
  revalidatePath("/cash");
  ok("/cash", "Reclaimed. The amount is in your balance.");
}
