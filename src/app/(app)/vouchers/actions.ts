"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, firstIssue, isObjectId, ok, str } from "@/lib/form";
import { appendLog } from "@/lib/hashlog";
import { getStanding } from "@/lib/standing.all";
import { commonsPublicKeyHex, decodeNote, newNonce, signVoucherFields, verifyVoucherSig, voucherToken } from "@/lib/voucher";

const issueSchema = z.object({
  ledger: z.enum(["GRACE", "HOURS"]),
  amount: z.coerce.number().positive().max(100000),
  memo: z.string().trim().max(200).optional(),
});

// Mint a signed bearer note. The amount is debited from the issuer now (a
// reservation), respecting their standing-based limit exactly like a transfer,
// so nobody can print more than they may owe. The note is credited to whoever
// redeems it later.
export async function issueVoucher(formData: FormData) {
  const me = await requireUser();
  const parsed = issueSchema.safeParse({
    ledger: str(formData, "ledger"),
    amount: str(formData, "amount"),
    memo: str(formData, "memo"),
  });
  if (!parsed.success) fail("/vouchers", firstIssue(parsed.error));
  const d = parsed.data;
  const amount = d.ledger === "GRACE" ? Math.round(d.amount) : Math.round(d.amount * 60);
  const standing = await getStanding(me.id);
  const limit = d.ledger === "GRACE" ? standing.graceLimit : standing.hoursLimit;
  const field = d.ledger === "GRACE" ? "graceBalance" : "hoursBalance";

  const nonce = newNonce();
  const signature = signVoucherFields({ issuerId: me.id, ledger: d.ledger, amount, nonce });

  let voucherId: string;
  try {
    voucherId = await db.$transaction(async (tx) => {
      const u = await tx.user.findUniqueOrThrow({ where: { id: me.id }, select: { graceBalance: true, hoursBalance: true } });
      const balance = d.ledger === "GRACE" ? u.graceBalance : u.hoursBalance;
      if (balance - amount < -limit) {
        throw new VoucherError(`This note would take you to ${balance - amount}, below your limit of -${limit}. Earn standing to extend it.`);
      }
      await tx.user.update({ where: { id: me.id }, data: { [field]: { decrement: amount } } });
      const v = await tx.voucher.create({ data: { issuerId: me.id, ledger: d.ledger, amount, memo: d.memo, nonce, signature } });
      await appendLog(tx, "VOUCHER_ISSUE", v.id, v as unknown as Record<string, unknown>);
      return v.id;
    });
  } catch (e) {
    if (e instanceof VoucherError) fail("/vouchers", e.message);
    throw e;
  }
  redirect(`/vouchers/${voucherId}`);
}

// Redeem a note by pasting its printed token. The signature is checked, then
// the nonce is looked up: if it is already redeemed or voided, this is a
// double-spend or a dead note, and it is refused. First valid redemption wins.
export async function redeemVoucher(formData: FormData) {
  const me = await requireUser();
  const token = str(formData, "token");
  if (!token) fail("/vouchers", "Paste the note's code to redeem it.");
  const note = decodeNote(token);
  if (!note) fail("/vouchers", "That code could not be read.");
  if (!verifyVoucherSig(voucherToken(note), note.sig, commonsPublicKeyHex())) {
    fail("/vouchers", "That note's signature does not check out. It was not minted here, or it was altered.");
  }

  try {
    await db.$transaction(async (tx) => {
      const v = await tx.voucher.findUnique({ where: { nonce: note.nonce } });
      if (!v) throw new VoucherError("No note with that code exists.");
      if (v.status === "REDEEMED") throw new VoucherError("Already redeemed. A note can only be spent once.");
      if (v.status === "VOIDED") throw new VoucherError("This note was voided by its issuer.");
      if (v.issuerId === me.id) throw new VoucherError("You cannot redeem your own note; void it instead to get the amount back.");
      const field = v.ledger === "GRACE" ? "graceBalance" : "hoursBalance";
      await tx.user.update({ where: { id: me.id }, data: { [field]: { increment: v.amount } } });
      const updated = await tx.voucher.update({ where: { id: v.id }, data: { status: "REDEEMED", redeemedById: me.id, redeemedAt: new Date() } });
      await appendLog(tx, "VOUCHER_REDEEM", updated.id, updated as unknown as Record<string, unknown>);
    });
  } catch (e) {
    if (e instanceof VoucherError) fail("/vouchers", e.message);
    throw e;
  }
  ok("/vouchers", "Redeemed. The amount is in your balance.");
}

// Void your own unredeemed note and get the reserved amount back.
export async function voidVoucher(id: string) {
  const me = await requireUser();
  if (!isObjectId(id)) redirect("/vouchers");
  try {
    await db.$transaction(async (tx) => {
      const v = await tx.voucher.findUnique({ where: { id } });
      if (!v || v.issuerId !== me.id) throw new VoucherError("That is not your note.");
      if (v.status !== "ISSUED") throw new VoucherError("Only an unredeemed note can be voided.");
      const field = v.ledger === "GRACE" ? "graceBalance" : "hoursBalance";
      await tx.user.update({ where: { id: me.id }, data: { [field]: { increment: v.amount } } });
      await tx.voucher.update({ where: { id }, data: { status: "VOIDED" } });
    });
  } catch (e) {
    if (e instanceof VoucherError) fail(`/vouchers/${id}`, e.message);
    throw e;
  }
  revalidatePath("/vouchers");
  ok("/vouchers", "Voided. The amount is back in your balance.");
}

class VoucherError extends Error {}
