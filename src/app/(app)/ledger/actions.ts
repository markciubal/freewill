"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
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
  const amount = d.ledger === "GRACE" ? Math.round(d.amount) : Math.round(d.amount * 60);
  try {
    await transfer({ ledger: d.ledger, fromId: me.id, toId: to.id, amount, memo: d.memo });
  } catch (e) {
    if (e instanceof LedgerError) fail("/ledger", e.message);
    throw e;
  }
  revalidatePath("/ledger");
  ok("/ledger", `Sent ${d.ledger === "GRACE" ? `${amount} GRC` : `${d.amount} hours`} to @${d.to}.`);
}
