"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeLocality } from "@/lib/form";
import { isValidLatLng, roundPin } from "@/lib/geo";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/lib/password";

export type AuthState = { error?: string };

const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username needs at least 3 characters")
  .max(24, "Username can be at most 24 characters")
  .regex(/^[a-z0-9_]+$/, "Username: letters, numbers and underscores only");

const password = z.string().min(8, "Password needs at least 8 characters").max(128);

export async function join(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({
      username,
      password,
      displayName: z.string().trim().max(60).optional(),
      locality: z.string().trim().min(2, "Locality: say where you are").max(80),
      lat: z.coerce.number({ error: "Place your pin on the map" }).min(-90).max(90),
      lng: z.coerce.number({ error: "Place your pin on the map" }).min(-180).max(180),
      covenant: z.literal("on", { error: "You must affirm the covenant to join." }),
    })
    .safeParse({
      username: formData.get("username"),
      password: formData.get("password"),
      displayName: formData.get("displayName") || undefined,
      locality: formData.get("locality"),
      lat: formData.get("lat") || undefined,
      lng: formData.get("lng") || undefined,
      covenant: formData.get("covenant"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const d = parsed.data;
  if (!isValidLatLng(d)) return { error: "Place your pin on the map." };
  const pin = roundPin(d);
  let userId: string;
  try {
    const user = await db.user.create({
      data: {
        username: d.username,
        passwordHash: await hashPassword(d.password),
        displayName: d.displayName,
        locality: normalizeLocality(d.locality),
        lat: pin.lat,
        lng: pin.lng,
        covenantAcceptedAt: new Date(),
      },
      select: { id: true },
    });
    userId = user.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That username is already taken." };
    }
    throw e;
  }

  await createSession(userId);
  redirect("/home");
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({ username, password: z.string().min(1, "Password is required") })
    .safeParse({ username: formData.get("username"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await db.user.findUnique({
    where: { username: parsed.data.username },
    select: { id: true, passwordHash: true },
  });
  // Always run the comparison so timing does not reveal whether the name exists.
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return { error: "No such person, or wrong password. There are no resets: your password is yours alone." };

  await createSession(user.id);
  redirect("/home");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
