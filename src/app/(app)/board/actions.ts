"use server";

import type { Category } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { CATEGORIES } from "@/lib/covenant";
import { db } from "@/lib/db";
import { fail, firstIssue, isObjectId, str } from "@/lib/form";
import { LedgerError, transfer } from "@/lib/ledger";

const listingSchema = z.object({
  kind: z.enum(["OFFER", "NEED"]),
  category: z.enum(CATEGORIES as [Category, ...Category[]]),
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(3).max(2000),
  quantity: z.string().trim().max(60).optional(),
  wantsInReturn: z.string().trim().max(200).optional(),
  priceGrace: z.coerce.number().int().min(0).max(100000).optional(),
  priceHours: z.coerce.number().min(0).max(1000).optional(),
});

export async function createListing(formData: FormData) {
  const me = await requireUser();
  const parsed = listingSchema.safeParse({
    kind: str(formData, "kind"),
    category: str(formData, "category"),
    title: str(formData, "title"),
    description: str(formData, "description"),
    quantity: str(formData, "quantity"),
    wantsInReturn: str(formData, "wantsInReturn"),
    priceGrace: str(formData, "priceGrace"),
    priceHours: str(formData, "priceHours"),
  });
  if (!parsed.success) fail("/board/new", firstIssue(parsed.error));
  const d = parsed.data;
  const listing = await db.listing.create({
    data: {
      ...d,
      priceGrace: d.priceGrace || null,
      priceHours: d.priceHours ? Math.round(d.priceHours * 60) : null,
      ownerId: me.id,
      locality: me.locality,
      lat: me.lat,
      lng: me.lng,
    },
    select: { id: true },
  });
  redirect(`/board/${listing.id}`);
}

export async function pledge(listingId: string, formData: FormData) {
  const me = await requireUser();
  if (!isObjectId(listingId)) redirect("/board");
  const path = `/board/${listingId}`;
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { ownerId: true, status: true } });
  if (!listing || (listing.status !== "OPEN" && listing.status !== "MATCHED")) fail(path, "This listing is no longer open.");
  if (listing.ownerId === me.id) fail(path, "You cannot pledge on your own listing.");
  const existing = await db.pledge.findFirst({ where: { listingId, userId: me.id, status: { in: ["OFFERED", "ACCEPTED"] } } });
  if (existing) fail(path, "You already have a pledge here.");
  await db.pledge.create({ data: { listingId, userId: me.id, message: str(formData, "message") } });
  revalidatePath(path);
  redirect(path);
}

export async function respondToPledge(pledgeId: string, decision: "ACCEPTED" | "DECLINED") {
  const me = await requireUser();
  if (!isObjectId(pledgeId)) redirect("/board");
  const p = await db.pledge.findUnique({ where: { id: pledgeId }, include: { listing: { select: { id: true, ownerId: true } } } });
  if (!p || p.listing.ownerId !== me.id) fail("/board", "That pledge is not on your listing.");
  const path = `/board/${p.listing.id}`;
  await db.$transaction([
    db.pledge.update({ where: { id: pledgeId }, data: { status: decision } }),
    ...(decision === "ACCEPTED"
      ? [db.listing.update({ where: { id: p.listing.id }, data: { status: "MATCHED" } })]
      : []),
  ]);
  revalidatePath(path);
  redirect(path);
}

// Whoever pays confirms. For a NEED the owner received help and pays the helper.
// For an OFFER the pledger received the thing and pays the owner. Nobody can be
// debited without their own click.
export async function completeListing(listingId: string, pledgeId: string, formData: FormData) {
  const me = await requireUser();
  if (!isObjectId(listingId) || !isObjectId(pledgeId)) redirect("/board");
  const path = `/board/${listingId}`;
  const [listing, pledge] = await Promise.all([
    db.listing.findUnique({ where: { id: listingId } }),
    db.pledge.findUnique({ where: { id: pledgeId } }),
  ]);
  if (!listing || !pledge || pledge.listingId !== listingId) fail(path, "Pledge not found.");
  if (listing.status === "FULFILLED" || listing.status === "WITHDRAWN") fail(path, "This listing is already closed.");
  if (pledge.status === "DECLINED" || pledge.status === "COMPLETED") fail(path, "That pledge is closed.");

  const payerId = listing.kind === "NEED" ? listing.ownerId : pledge.userId;
  const payeeId = listing.kind === "NEED" ? pledge.userId : listing.ownerId;
  if (me.id !== payerId) {
    fail(path, listing.kind === "NEED" ? "Only the person with the need can confirm it was met." : "Only the person taking the offer can confirm it was received.");
  }
  if (listing.kind === "OFFER" && pledge.status !== "ACCEPTED") fail(path, "The owner has not accepted your pledge yet.");

  const settle = formData.get("settle") === "on";
  try {
    if (settle && listing.priceGrace) {
      await transfer({ ledger: "GRACE", fromId: payerId, toId: payeeId, amount: listing.priceGrace, memo: listing.title, listingId });
    }
    if (settle && listing.priceHours) {
      await transfer({ ledger: "HOURS", fromId: payerId, toId: payeeId, amount: listing.priceHours, memo: listing.title, listingId });
    }
  } catch (e) {
    if (e instanceof LedgerError) fail(path, e.message);
    throw e;
  }

  await db.$transaction([
    db.listing.update({ where: { id: listingId }, data: { status: "FULFILLED", fulfilledAt: new Date() } }),
    db.pledge.update({ where: { id: pledgeId }, data: { status: "COMPLETED" } }),
    db.pledge.updateMany({
      where: { listingId, id: { not: pledgeId }, status: { in: ["OFFERED", "ACCEPTED"] } },
      data: { status: "DECLINED" },
    }),
  ]);
  revalidatePath(path);
  redirect(path);
}

export async function withdrawListing(listingId: string) {
  const me = await requireUser();
  if (!isObjectId(listingId)) redirect("/board");
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { ownerId: true } });
  if (!listing || listing.ownerId !== me.id) fail(`/board/${listingId}`, "Not your listing.");
  await db.listing.update({ where: { id: listingId }, data: { status: "WITHDRAWN" } });
  revalidatePath("/board");
  redirect("/board");
}
