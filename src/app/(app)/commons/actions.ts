"use server";

import type { Category } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { CATEGORIES } from "@/lib/covenant";
import { db } from "@/lib/db";
import { fail, firstIssue, isObjectId, ok, str } from "@/lib/form";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(3).max(2000),
  category: z.enum(CATEGORIES as [Category, ...Category[]]),
  rules: z.string().trim().max(2000).optional(),
});

export async function createCommons(formData: FormData) {
  const me = await requireUser();
  const parsed = schema.safeParse({
    name: str(formData, "name"),
    description: str(formData, "description"),
    category: str(formData, "category"),
    rules: str(formData, "rules"),
  });
  if (!parsed.success) fail("/commons", firstIssue(parsed.error));
  await db.commons.create({ data: { ...parsed.data, stewardId: me.id, locality: me.locality, lat: me.lat, lng: me.lng } });
  revalidatePath("/commons");
  ok("/commons", `${parsed.data.name} added, with you as steward.`);
}

export async function toggleCommons(id: string) {
  const me = await requireUser();
  if (!isObjectId(id)) fail("/commons", "Not found.");
  const c = await db.commons.findUnique({ where: { id }, select: { stewardId: true, available: true } });
  if (!c || c.stewardId !== me.id) fail("/commons", "Only the steward can do that.");
  await db.commons.update({ where: { id }, data: { available: !c.available } });
  revalidatePath("/commons");
  ok("/commons", "Updated.");
}
