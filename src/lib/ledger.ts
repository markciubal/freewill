import type { Ledger } from "@prisma/client";
import { db } from "./db";
import { maybeRunDemurrage } from "./demurrage";
import { appendLog } from "./hashlog";
import { getStanding } from "./standing.all";

// Mutual credit. There is no mint. A transfer simultaneously credits the payee
// and debits the payer, so the sum of all balances on each ledger is always
// zero (plus the demurrage remainder). The only constraint is how far below
// zero a person may go, and that is set by their standing. Unverified people
// (too few vouches) cannot go below zero at all.
//
// This is the only function that moves a balance between two people. Every
// other balance change is a demurrage adjustment (demurrage.ts) or a cash /
// voucher reservation, and each of those also appends to the hash chain.
//
// The process for one transfer:
//   1. Reject nonsense: non-integer or non-positive amounts, paying yourself.
//   2. Run demurrage if a month has passed (Grace only), so limits are current.
//   3. Look up the payer's standing: their credit limit is the only rule.
//   4. Inside one transaction: read the payer's balance, refuse if the payment
//      would breach the limit, debit, credit, record, and append to the chain.

export class LedgerError extends Error {}

export async function transfer(options: {
  ledger: Ledger;
  fromId: string;
  toId: string;
  amount: number; // Grace in cents, or minutes for HOURS
  memo?: string;
  listingId?: string;
}) {
  const { ledger, fromId: payerId, toId: payeeId, amount, memo, listingId } = options;

  // Step 1.
  if (!Number.isInteger(amount) || amount <= 0) throw new LedgerError("Amount must be a positive whole number.");
  if (payerId === payeeId) throw new LedgerError("You cannot pay yourself.");

  // Steps 2 and 3.
  if (ledger === "GRACE") await maybeRunDemurrage();
  const payerStanding = await getStanding(payerId);
  const creditLimit = ledger === "GRACE" ? payerStanding.graceLimit : payerStanding.hoursLimit;

  // Step 4. Interactive transactions require MongoDB to run as a replica set.
  return db.$transaction(async (tx) => {
    const [payer, payee] = await Promise.all([
      tx.user.findUnique({ where: { id: payerId }, select: { graceBalance: true, hoursBalance: true } }),
      tx.user.findUnique({ where: { id: payeeId }, select: { id: true } }),
    ]);
    if (!payer) throw new LedgerError("Payer not found.");
    if (!payee) throw new LedgerError("Recipient not found.");

    const payerBalance = ledger === "GRACE" ? payer.graceBalance : payer.hoursBalance;
    const balanceAfter = payerBalance - amount;
    if (balanceAfter < -creditLimit) {
      // Grace is stored in cents; say it in whole Grace.
      const show = (value: number) => (ledger === "GRACE" ? `${(value / 100).toFixed(2)} GRC` : `${value} minutes`);
      const hint = payerStanding.verified
        ? "Earn standing (vouches, kept pledges) to extend it."
        : `You need ${payerStanding.requiredVouches} vouch${payerStanding.requiredVouches === 1 ? "" : "es"} from people here before you can go below zero.`;
      throw new LedgerError(`This would take you to ${show(balanceAfter)}, below your limit of ${show(-creditLimit)}. ${hint}`);
    }

    const balanceField = ledger === "GRACE" ? "graceBalance" : "hoursBalance";
    await tx.user.update({ where: { id: payerId }, data: { [balanceField]: { decrement: amount } } });
    await tx.user.update({ where: { id: payeeId }, data: { [balanceField]: { increment: amount } } });
    const record = await tx.transfer.create({ data: { ledger, fromId: payerId, toId: payeeId, amount, memo, listingId } });
    await appendLog(tx, "TRANSFER", record.id, record as unknown as Record<string, unknown>);
    return record;
  });
}
