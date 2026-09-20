"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSession, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, firstIssue, normalizeLocality, ok, str } from "@/lib/form";
import { isValidLatLng, roundPin } from "@/lib/geo";
import { hashPassword, verifyPassword } from "@/lib/password";
import { PASSWORD_MAX_LENGTH, passwordProblem } from "@/lib/security";

// Everything chosen at sign-up except the username can be changed here. The
// pin is rounded the same way it was at join (about a hundred meters) and is
// still never shown to anyone as a point. Things already published keep the
// pin they were published with.
const schema = z.object({
  displayName: z.string().trim().max(60).optional(),
  locality: z.string().trim().min(2, "Locality: say where you are").max(80),
  bio: z.string().trim().max(1000).optional(),
  skills: z.string().trim().max(500).optional(),
  lat: z.coerce.number({ error: "Place your pin on the map" }).min(-90).max(90),
  lng: z.coerce.number({ error: "Place your pin on the map" }).min(-180).max(180),
});

export async function updateProfile(formData: FormData) {
  const me = await requireUser();
  const parsed = schema.safeParse({
    displayName: str(formData, "displayName"),
    locality: str(formData, "locality"),
    bio: str(formData, "bio"),
    skills: str(formData, "skills"),
    lat: str(formData, "lat") || undefined,
    lng: str(formData, "lng") || undefined,
  });
  if (!parsed.success) fail("/profile", firstIssue(parsed.error));
  const d = parsed.data;
  if (!isValidLatLng(d)) fail("/profile", "Place your pin on the map.");
  const pin = roundPin(d);
  const skills = Array.from(
    new Set((d.skills ?? "").split(/[,\n]/).map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0 && s.length <= 30)),
  ).slice(0, 30);
  await db.user.update({
    where: { id: me.id },
    data: { displayName: d.displayName ?? null, locality: normalizeLocality(d.locality), bio: d.bio ?? null, skills, lat: pin.lat, lng: pin.lng },
  });
  revalidatePath("/profile");
  revalidatePath(`/people/${me.username}`);
  ok("/profile", "Saved.");
}

// Changing a password needs the current one: there is still no reset, and no
// one else can do this for you. Every other device is logged out because the
// session version moves; this device gets a fresh cookie so it stays in.
export async function changePassword(formData: FormData) {
  const me = await requireUser();
  const parsed = z
    .object({
      currentPassword: z.string().min(1, "Type your current password."),
      newPassword: z.string().min(1, "Choose a new password.").max(PASSWORD_MAX_LENGTH),
      confirmPassword: z.string(),
    })
    .safeParse({
      currentPassword: str(formData, "currentPassword"),
      newPassword: str(formData, "newPassword"),
      confirmPassword: str(formData, "confirmPassword"),
    });
  if (!parsed.success) fail("/profile", firstIssue(parsed.error));
  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  if (newPassword !== confirmPassword) fail("/profile", "The two new passwords do not match.");
  const weakness = passwordProblem(newPassword, me.username);
  if (weakness) fail("/profile", weakness);

  const account = await db.user.findUnique({ where: { id: me.id }, select: { passwordHash: true } });
  if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) fail("/profile", "Your current password is wrong.");

  const updated = await db.user.update({
    where: { id: me.id },
    data: { passwordHash: await hashPassword(newPassword), sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  await createSession(me.id, updated.sessionVersion);
  ok("/profile", "Password changed. Every other device has been logged out.");
}

// Kill every session, including this one's old cookie, then issue this device
// a fresh one. For a lost phone or a shared computer.
export async function logoutEverywhere() {
  const me = await requireUser();
  const updated = await db.user.update({ where: { id: me.id }, data: { sessionVersion: { increment: 1 } }, select: { sessionVersion: true } });
  await createSession(me.id, updated.sessionVersion);
  ok("/profile", "Logged out everywhere else. This device stays signed in.");
}

// Remove the optional ID.me attestation from this account. ID.me keeps its
// own records; this only clears what we hold.
export async function unlinkIdme() {
  const me = await requireUser();
  await db.user.update({ where: { id: me.id }, data: { humanVerifiedAt: null, idmeHash: null, affiliations: [] } });
  revalidatePath("/profile");
  revalidatePath(`/people/${me.username}`);
  ok("/profile", "Removed. Your ID.me badges and the extra vouch no longer show.");
}
