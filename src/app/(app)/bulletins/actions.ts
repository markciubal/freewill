"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, firstIssue, ok, str } from "@/lib/form";

const schema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(3000),
  level: z.enum(["INFO", "HAZARD", "URGENT"]),
  everywhere: z.boolean(),
  expiresInDays: z.coerce.number().int().min(0).max(365).optional(),
});

export async function postBulletin(formData: FormData) {
  const me = await requireUser();
  const parsed = schema.safeParse({
    title: str(formData, "title"),
    body: str(formData, "body"),
    level: str(formData, "level"),
    everywhere: formData.get("everywhere") === "on",
    expiresInDays: str(formData, "expiresInDays"),
  });
  if (!parsed.success) fail("/bulletins", firstIssue(parsed.error));
  const d = parsed.data;
  const expiresAt = d.expiresInDays ? new Date(Date.now() + d.expiresInDays * 86_400_000) : null;
  await db.bulletin.create({ data: { title: d.title, body: d.body, level: d.level, locality: d.everywhere ? null : me.locality, lat: d.everywhere ? null : me.lat, lng: d.everywhere ? null : me.lng, expiresAt, authorId: me.id } });
  revalidatePath("/bulletins");
  revalidatePath("/home");
  ok("/bulletins", "Posted.");
}
