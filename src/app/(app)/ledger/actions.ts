"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fmtGrace } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, firstIssue, ok, str } from "@/lib/form";
import { LedgerError, transfer } from "@/lib/ledger";

const schema = z.object({
  to: z.string().trim().toLowerCase().min(3).max(24),
  ledger: z.enum(["GRACE", "HOURS"]),
  amount: z.coerce.number().positive().max(100000),
  memo: z.string().trim().max(200).optional(),
});

export async function sendTransfer(formData: FormData) {
  const me = await requireUser();
  const parsed = schema.safeParse({
    to: str(formData, "to")?.replace(/^@/, ""),
    ledger: str(formData, "ledger"),
    amount: str(formData, "amount"),
    memo: str(formData, "memo"),
  });
  if (!parsed.success) fail("/ledger", firstIssue(parsed.error));
  const d = parsed.data;
  const to = await db.user.findUnique({ where: { username: d.to }, select: { id: true } });
  if (!to) fail("/ledger", `No one here is called @${d.to}.`);
  // Grace is stored in cents (hundredths), Hours in minutes.
  const amount = d.ledger === "GRACE" ? Math.round(d.amount * 100) : Math.round(d.amount * 60);
  try {
    await transfer({ ledger: d.ledger, fromId: me.id, toId: to.id, amount, memo: d.memo });
  } catch (e) {
    if (e instanceof LedgerError) fail("/ledger", e.message);
    throw e;
  }
  revalidatePath("/ledger");
  ok("/ledger", `Sent ${d.ledger === "GRACE" ? fmtGrace(amount) : `${d.amount} hour${d.amount === 1 ? "" : "s"}`} to @${d.to}.`);
}
