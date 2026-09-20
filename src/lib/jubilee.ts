import { db } from "./db";
import { explainZeroSum, zeroSumParts } from "./explain";

// The jubilee / wind-down. Your instinct - "if it fails, wealth distributes
// evenly as a fail-safe" - is already baked into mutual credit, and this makes
// it visible. Because every balance nets to zero, dissolving the commons costs
// no one: debts are forgiven, credits release claims that were only ever
// promises, and everyone returns to zero together. The cost of failure is
// distributed perfectly evenly - it is zero for each person. There is no
// treasury to seize and no one left holding the loss.

export type WindDownReport = {
  members: number;
  graceDebtForgiven: number; // sum of what debtors owed the commons, in cents
  gracePositiveReleased: number; // sum of what creditors held, in cents
  hoursDebtForgiven: number; // in minutes
  hoursPositiveReleased: number;
  outstandingVouchers: number; // Grace held in unredeemed vouchers and locked cash notes, in cents
  remainder: number; // cents carried by the last demurrage run
  openDisputes: number;
  commons: number;
  balances: boolean; // does everything still net to zero
};

export async function windDownReport(): Promise<WindDownReport> {
  const [members, parts, openDisputes, commons] = await Promise.all([
    db.user.findMany({ select: { graceBalance: true, hoursBalance: true } }),
    zeroSumParts(),
    db.circle.count({ where: { status: { in: ["OPEN", "GATHERING"] } } }),
    db.commons.count(),
  ]);

  let graceDebtForgiven = 0;
  let gracePositiveReleased = 0;
  let hoursDebtForgiven = 0;
  let hoursPositiveReleased = 0;
  for (const member of members) {
    if (member.graceBalance < 0) graceDebtForgiven += -member.graceBalance;
    else gracePositiveReleased += member.graceBalance;
    if (member.hoursBalance < 0) hoursDebtForgiven += -member.hoursBalance;
    else hoursPositiveReleased += member.hoursBalance;
  }

  return {
    members: members.length,
    graceDebtForgiven,
    gracePositiveReleased,
    hoursDebtForgiven,
    hoursPositiveReleased,
    outstandingVouchers: parts.reservedInVouchers + parts.lockedInCash,
    remainder: parts.carriedRemainder,
    openDisputes,
    commons,
    // The same check "Show the work" walks through step by step.
    balances: explainZeroSum(parts).balances,
  };
}
