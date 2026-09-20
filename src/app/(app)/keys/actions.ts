"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPublicKey } from "@/lib/keys";

export type KeyResult = { error?: string; ok?: string };

// Register the public half of a device-generated identity key. The server only
// ever sees the public key; the private key stays on the member's device.
export async function registerPublicKey(publicKey: string): Promise<KeyResult> {
  const me = await requireUser();
  const pub = publicKey.trim().toLowerCase();
  if (!isPublicKey(pub)) return { error: "That does not look like a public key." };
  const taken = await db.user.findFirst({ where: { publicKey: pub, id: { not: me.id } }, select: { id: true } });
  if (taken) return { error: "That key already belongs to another account." };
  await db.user.update({ where: { id: me.id }, data: { publicKey: pub, keySetAt: me.publicKey === pub ? me.keySetAt : new Date() } });
  revalidatePath("/keys");
  revalidatePath(`/people/${me.username}`);
  return { ok: "Identity key registered. Your vouches can now be signed." };
}

export async function removePublicKey(): Promise<KeyResult> {
  const me = await requireUser();
  await db.user.update({ where: { id: me.id }, data: { publicKey: null, keySetAt: null } });
  revalidatePath("/keys");
  revalidatePath(`/people/${me.username}`);
  return { ok: "Identity key removed from your account. Existing signatures stay on record but no longer verify." };
}
