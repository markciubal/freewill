import type { Ledger } from "@prisma/client";
import { db } from "./db";
import { maybeRunDemurrage } from "./demurrage";
import { getStanding } from "./standing.all";

// Mutual credit. There is no mint. A transfer simultaneously credits the payee
// and debits the payer, so the sum of all balances on each ledger is always
// zero (plus the demurrage remainder). The only constraint is how far below
// zero a person may go, and that is set by their standing. Unverified people
// (too few vouches) cannot go below zero at all.

export class LedgerError extends Error {}

export async function transfer(opts: {
  ledger: Ledger;
  fromId: string;
  toId: string;
  amount: number; // GRC units, or minutes for HOURS
  memo?: string;
  listingId?: string;
}) {
  const { ledger, fromId, toId, amount, memo, listingId } = opts;
  if (!Number.isInteger(amount) || amount <= 0) throw new LedgerError("Amount must be a positive whole number.");
  if (fromId === toId) throw new LedgerError("You cannot pay yourself.");

  if (ledger === "GRACE") await maybeRunDemurrage();
  const standing = await getStanding(fromId);
  const limit = ledger === "GRACE" ? standing.graceLimit : standing.hoursLimit;

  // Interactive transactions require MongoDB to run as a replica set.
  return db.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.user.findUnique({ where: { id: fromId }, select: { graceBalance: true, hoursBalance: true } }),
      tx.user.findUnique({ where: { id: toId }, select: { id: true } }),
    ]);
    if (!from) throw new LedgerError("Payer not found.");
    if (!to) throw new LedgerError("Recipient not found.");

    const balance = ledger === "GRACE" ? from.graceBalance : from.hoursBalance;
    if (balance - amount < -limit) {
      const unit = ledger === "GRACE" ? "GRC" : "minutes";
      const hint = standing.verified
        ? "Earn standing (vouches, kept pledges) to extend it."
        : `You need ${standing.requiredVouches} vouch${standing.requiredVouches === 1 ? "" : "es"} from people here before you can go below zero.`;
      throw new LedgerError(`This would take you to ${balance - amount} ${unit}, below your limit of -${limit}. ${hint}`);
    }

    const field = ledger === "GRACE" ? "graceBalance" : "hoursBalance";
    await tx.user.update({ where: { id: fromId }, data: { [field]: { decrement: amount } } });
    await tx.user.update({ where: { id: toId }, data: { [field]: { increment: amount } } });
    return tx.transfer.create({ data: { ledger, fromId, toId, amount, memo, listingId } });
  });
}
