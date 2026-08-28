"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, str } from "@/lib/form";
import { getStanding } from "@/lib/standing.all";

export async function vouch(username: string, formData: FormData) {
  const me = await requireUser();
  const path = `/people/${username}`;
  const target = await db.user.findUnique({ where: { username }, select: { id: true } });
  if (!target) redirect("/people");
  if (target.id === me.id) fail(path, "You cannot vouch for yourself.");
  const standing = await getStanding(me.id);
  if (!standing.verified) fail(path, "You cannot vouch for others until you are verified yourself.");
  await db.vouch.upsert({
    where: { fromId_toId: { fromId: me.id, toId: target.id } },
    create: { fromId: me.id, toId: target.id, note: str(formData, "note") },
    update: { note: str(formData, "note") },
  });
  revalidatePath(path);
  redirect(path);
}

export async function unvouch(username: string) {
  const me = await requireUser();
  const path = `/people/${username}`;
  const target = await db.user.findUnique({ where: { username }, select: { id: true } });
  if (!target) redirect("/people");
  await db.vouch.deleteMany({ where: { fromId: me.id, toId: target.id } });
  revalidatePath(path);
  redirect(path);
}
