"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, ok, str } from "@/lib/form";
import { isDefaultTheme, sanitizeTheme } from "@/lib/theme";

export async function saveTheme(formData: FormData) {
  const me = await requireUser();
  const raw = str(formData, "theme");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "");
  } catch {
    fail("/theme", "That theme could not be read.");
  }
  const theme = sanitizeTheme(parsed);
  // Prisma's Json input type; DbNull clears the field when back at defaults.
  await db.user.update({ where: { id: me.id }, data: { theme: isDefaultTheme(theme) ? { unset: true } : theme } });
  revalidatePath("/", "layout");
  ok("/theme", "Saved. This is how Freewill looks for you now, on every device you sign in from.");
}

export async function resetTheme() {
  const me = await requireUser();
  await db.user.update({ where: { id: me.id }, data: { theme: { unset: true } } });
  revalidatePath("/", "layout");
  ok("/theme", "Back to the defaults.");
}
