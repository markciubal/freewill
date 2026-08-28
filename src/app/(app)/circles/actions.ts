"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, firstIssue, isObjectId, str } from "@/lib/form";
import { KEEPERS_PER_CIRCLE, fillKeepers } from "@/lib/keepers";
import { getStanding } from "@/lib/standing.all";

const raiseSchema = z.object({
  title: z.string().trim().min(3).max(120),
  account: z.string().trim().min(10).max(5000),
  about: z.string().trim().toLowerCase().max(24).optional(),
});

// Accusations are a currency. Each person may hold only so many circles open
// at once (their allowance, from standing), and an accusation found UNFOUNDED
// costs standing and shrinks the allowance. That is what restrains a bad actor
// who would use circles as a weapon.
export async function raiseCircle(formData: FormData) {
  const me = await requireUser();
  const parsed = raiseSchema.safeParse({
    title: str(formData, "title"),
    account: str(formData, "account"),
    about: str(formData, "about")?.replace(/^@/, ""),
  });
  if (!parsed.success) fail("/circles", firstIssue(parsed.error));
  const d = parsed.data;

  const [standing, openRaised] = await Promise.all([
    getStanding(me.id),
    db.circle.count({ where: { raisedById: me.id, status: { in: ["OPEN", "GATHERING"] } } }),
  ]);
  if (openRaised >= standing.circleAllowance) {
    fail("/circles", `You already have ${openRaised} circle${openRaised === 1 ? "" : "s"} open, which is all your standing allows. See them through first.`);
  }

  let aboutId: string | undefined;
  if (d.about) {
    const u = await db.user.findUnique({ where: { username: d.about }, select: { id: true } });
    if (!u) fail("/circles", `No one here is called @${d.about}.`);
    if (u.id === me.id) fail("/circles", "A circle is about harm between people, not yourself.");
    aboutId = u.id;
  }
  const c = await db.circle.create({
    data: { title: d.title, account: d.account, raisedById: me.id, aboutId, locality: me.locality, lat: me.lat, lng: me.lng, keepersNeeded: KEEPERS_PER_CIRCLE },
    select: { id: true },
  });
  await fillKeepers(c.id);
  redirect(`/circles/${c.id}`);
}

// Keepers are drawn by lot. A drawn keeper may decline; the seat is redrawn.
export async function declineKeeping(id: string) {
  const me = await requireUser();
  if (!isObjectId(id)) redirect("/circles");
  const path = `/circles/${id}`;
  const c = await db.circle.findUnique({ where: { id } });
  if (!c || !c.keeperIds.includes(me.id)) fail(path, "You are not keeping this circle.");
  await db.circle.update({
    where: { id },
    data: { keeperIds: { set: c.keeperIds.filter((k) => k !== me.id) }, declinedKeeperIds: { push: me.id } },
  });
  await fillKeepers(id);
  revalidatePath(path);
  redirect(path);
}

export async function redrawKeepers(id: string) {
  await requireUser();
  if (!isObjectId(id)) redirect("/circles");
  const path = `/circles/${id}`;
  await fillKeepers(id);
  revalidatePath(path);
  redirect(path);
}

export async function resolveCircle(id: string, formData: FormData) {
  const me = await requireUser();
  if (!isObjectId(id)) redirect("/circles");
  const path = `/circles/${id}`;
  const c = await db.circle.findUnique({ where: { id } });
  if (!c) redirect("/circles");
  if (c.status === "RESOLVED" || c.status === "DISMISSED") fail(path, "This circle is closed.");
  if (!c.keeperIds.includes(me.id)) fail(path, "Only a keeper may record the resolution.");
  const outcome = str(formData, "outcome");
  if (outcome !== "HARM_FOUND" && outcome !== "NO_HARM" && outcome !== "UNFOUNDED") fail(path, "Choose an outcome.");
  if (outcome === "HARM_FOUND" && !c.aboutId) fail(path, "This circle names nobody, so harm cannot be found against anyone. Choose No harm or Unfounded.");
  const resolution = str(formData, "resolution");
  if (!resolution || resolution.length < 10) fail(path, "Write out what was agreed, in full.");
  await db.circle.update({ where: { id }, data: { status: "RESOLVED", outcome, resolution, resolvedAt: new Date() } });
  revalidatePath(path);
  redirect(path);
}

export async function dismissCircle(id: string) {
  const me = await requireUser();
  if (!isObjectId(id)) redirect("/circles");
  const path = `/circles/${id}`;
  const c = await db.circle.findUnique({ where: { id }, select: { raisedById: true, status: true } });
  if (!c) redirect("/circles");
  if (c.raisedById !== me.id) fail(path, "Only the person who raised it can withdraw it.");
  if (c.status === "RESOLVED") fail(path, "Already resolved.");
  await db.circle.update({ where: { id }, data: { status: "DISMISSED", resolvedAt: new Date() } });
  revalidatePath(path);
  redirect(path);
}
