import { db } from "./db";
import { latestRun } from "./demurrage";

// The jubilee / wind-down. Your instinct - "if it fails, wealth distributes
// evenly as a fail-safe" - is already baked into mutual credit, and this makes
// it visible. Because every balance nets to zero, dissolving the commons costs
// no one: debts are forgiven, credits release claims that were only ever
// promises, and everyone returns to zero together. The cost of failure is
// distributed perfectly evenly - it is zero for each person. There is no
// treasury to seize and no one left holding the loss.

export type WindDownReport = {
  members: number;
  graceDebtForgiven: number; // sum of what debtors owed the commons
  gracePositiveReleased: number; // sum of what creditors held
  hoursDebtForgiven: number; // in minutes
  hoursPositiveReleased: number;
  outstandingVouchers: number;
  remainder: number;
  openDisputes: number;
  commons: number;
  balances: boolean; // does everything still net to zero
};

export async function windDownReport(): Promise<WindDownReport> {
  const [users, run, voucherAgg, cashAgg, openDisputes, commons] = await Promise.all([
    db.user.findMany({ select: { graceBalance: true, hoursBalance: true } }),
    latestRun(),
    db.voucher.aggregate({ where: { status: "ISSUED" }, _sum: { amount: true } }),
    db.cashNote.aggregate({ where: { status: "LOCKED" }, _sum: { denomination: true } }),
    db.circle.count({ where: { status: { in: ["OPEN", "GATHERING"] } } }),
    db.commons.count(),
  ]);
  const vouchers = (voucherAgg._sum.amount ?? 0) + (cashAgg._sum.denomination ?? 0);

  let graceDebt = 0, gracePos = 0, hoursDebt = 0, hoursPos = 0, graceSum = 0, hoursSum = 0;
  for (const u of users) {
    graceSum += u.graceBalance;
    hoursSum += u.hoursBalance;
    if (u.graceBalance < 0) graceDebt += -u.graceBalance;
    else gracePos += u.graceBalance;
    if (u.hoursBalance < 0) hoursDebt += -u.hoursBalance;
    else hoursPos += u.hoursBalance;
  }
  const remainder = run?.remainder ?? 0;

  return {
    members: users.length,
    graceDebtForgiven: graceDebt,
    gracePositiveReleased: gracePos,
    hoursDebtForgiven: hoursDebt,
    hoursPositiveReleased: hoursPos,
    outstandingVouchers: vouchers,
    remainder,
    openDisputes,
    commons,
    // Grace nets to zero once the demurrage remainder and voucher reserves are
    // counted; Hours nets to zero on its own.
    balances: graceSum + remainder + vouchers === 0 && hoursSum === 0,
  };
}
