"use server";

import type { SeedCategory, SeedForm } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, firstIssue, isObjectId, str } from "@/lib/form";
import { SEED_CATEGORIES, SEED_FORMS, parseSowMonths } from "@/lib/seeds";

const shareSchema = z.object({
  name: z.string().trim().min(2).max(80),
  form: z.enum(SEED_FORMS as [SeedForm, ...SeedForm[]]),
  category: z.enum(SEED_CATEGORIES as [SeedCategory, ...SeedCategory[]]),
  description: z.string().trim().min(3).max(2000),
  openPollinated: z.enum(["yes", "no", "unknown"]),
  quantity: z.string().trim().max(60).optional(),
  yearSaved: z.coerce.number().int().min(1900).max(2100).optional(),
  daysToMaturity: z.coerce.number().int().min(1).max(3650).optional(),
  sowMonths: z.string().trim().max(120).optional(),
});

export async function createSeedShare(formData: FormData) {
  const me = await requireUser();
  const parsed = shareSchema.safeParse({
    name: str(formData, "name"),
    form: str(formData, "form"),
    category: str(formData, "category"),
    description: str(formData, "description"),
    openPollinated: str(formData, "openPollinated") ?? "unknown",
    quantity: str(formData, "quantity"),
    yearSaved: str(formData, "yearSaved"),
    daysToMaturity: str(formData, "daysToMaturity"),
    sowMonths: str(formData, "sowMonths"),
  });
  if (!parsed.success) fail("/seeds", firstIssue(parsed.error));
  const d = parsed.data;
  const share = await db.seedShare.create({
    data: {
      name: d.name,
      form: d.form,
      category: d.category,
      description: d.description,
      openPollinated: d.openPollinated === "yes" ? true : d.openPollinated === "no" ? false : null,
      quantity: d.quantity ?? null,
      yearSaved: d.yearSaved ?? null,
      daysToMaturity: d.daysToMaturity ?? null,
      sowMonths: parseSowMonths(d.sowMonths),
      locality: me.locality,
      lat: me.lat,
      lng: me.lng,
      stewardId: me.id,
    },
    select: { id: true },
  });
  redirect(`/seeds/${share.id}`);
}

export async function requestSeeds(seedShareId: string, formData: FormData) {
  const me = await requireUser();
  if (!isObjectId(seedShareId)) redirect("/seeds");
  const path = `/seeds/${seedShareId}`;
  const share = await db.seedShare.findUnique({ where: { id: seedShareId }, select: { stewardId: true, available: true } });
  if (!share || !share.available) fail(path, "This variety is not available right now.");
  if (share.stewardId === me.id) fail(path, "This is your own variety.");
  const existing = await db.seedRequest.findFirst({ where: { seedShareId, userId: me.id, status: { in: ["REQUESTED", "GIVEN"] } } });
  if (existing) fail(path, "You already have an open request for this variety.");
  await db.seedRequest.create({ data: { seedShareId, userId: me.id, message: str(formData, "message") } });
  revalidatePath(path);
  redirect(path);
}

// The steward hands seed over (GIVEN) or declines. Only the steward decides.
export async function respondToSeedRequest(requestId: string, decision: "GIVEN" | "DECLINED") {
  const me = await requireUser();
  if (!isObjectId(requestId)) redirect("/seeds");
  const r = await db.seedRequest.findUnique({ where: { id: requestId }, include: { seedShare: { select: { id: true, stewardId: true } } } });
  if (!r || r.seedShare.stewardId !== me.id) fail("/seeds", "That request is not on your variety.");
  const path = `/seeds/${r.seedShare.id}`;
  if (r.status !== "REQUESTED") fail(path, "That request is already settled.");
  await db.seedRequest.update({ where: { id: requestId }, data: { status: decision } });
  revalidatePath(path);
  redirect(path);
}

// Either party can record that seed came back at harvest: the bank grew.
export async function markReturned(requestId: string) {
  const me = await requireUser();
  if (!isObjectId(requestId)) redirect("/seeds");
  const r = await db.seedRequest.findUnique({ where: { id: requestId }, include: { seedShare: { select: { id: true, stewardId: true } } } });
  if (!r) redirect("/seeds");
  const path = `/seeds/${r.seedShare.id}`;
  if (r.userId !== me.id && r.seedShare.stewardId !== me.id) fail(path, "Only the grower or the steward can record a return.");
  if (r.status !== "GIVEN") fail(path, "Seed can only be returned after it was given.");
  await db.seedRequest.update({ where: { id: requestId }, data: { status: "RETURNED", returnedAt: new Date() } });
  revalidatePath(path);
  redirect(path);
}

export async function toggleSeedShare(id: string) {
  const me = await requireUser();
  if (!isObjectId(id)) fail("/seeds", "Not found.");
  const s = await db.seedShare.findUnique({ where: { id }, select: { stewardId: true, available: true } });
  if (!s || s.stewardId !== me.id) fail(`/seeds/${id}`, "Only the steward can do that.");
  await db.seedShare.update({ where: { id }, data: { available: !s.available } });
  revalidatePath(`/seeds/${id}`);
  redirect(`/seeds/${id}`);
}
