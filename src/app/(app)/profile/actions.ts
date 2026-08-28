"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, firstIssue, ok, str } from "@/lib/form";

const schema = z.object({
  displayName: z.string().trim().max(60).optional(),
  bio: z.string().trim().max(1000).optional(),
  skills: z.string().trim().max(500).optional(),
});

export async function updateProfile(formData: FormData) {
  const me = await requireUser();
  const parsed = schema.safeParse({
    displayName: str(formData, "displayName"),
    bio: str(formData, "bio"),
    skills: str(formData, "skills"),
  });
  if (!parsed.success) fail("/profile", firstIssue(parsed.error));
  const d = parsed.data;
  const skills = Array.from(
    new Set((d.skills ?? "").split(/[,\n]/).map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0 && s.length <= 30)),
  ).slice(0, 30);
  await db.user.update({
    where: { id: me.id },
    data: { displayName: d.displayName ?? null, bio: d.bio ?? null, skills },
  });
  revalidatePath("/profile");
  revalidatePath(`/people/${me.username}`);
  ok("/profile", "Saved.");
}
