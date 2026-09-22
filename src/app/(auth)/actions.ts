"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { firstIssue, issueField, normalizeLocality } from "@/lib/form";
import { isValidLatLng, roundPin } from "@/lib/geo";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/lib/password";
import { RATE_LIMITS, clientAddressKey, rateLimitPermits, recordAttempt, usernameKey } from "@/lib/ratelimit";
import { PASSWORD_MAX_LENGTH, addressLimit, passwordProblem, rateLimitMessage } from "@/lib/security";

export type AuthState = { error?: string; field?: string };

const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username needs at least 3 characters")
  .max(24, "Username can be at most 24 characters")
  .regex(/^[a-z0-9_]+$/, "Username: letters, numbers and underscores only");

// Length is checked here; the full rule (well-known passwords, the username
// inside the password) runs in passwordProblem once the username is known.
const password = z.string().min(1, "Password is required").max(PASSWORD_MAX_LENGTH);

export async function join(_prev: AuthState, formData: FormData): Promise<AuthState> {
  // Each join creates an account, so the address is throttled before anything
  // else is looked at.
  const addressKey = await clientAddressKey();
  const permitted = await rateLimitPermits("join", [{ key: addressKey, limit: addressLimit(addressKey, "joinPerAddress") }]);
  if (!permitted.allowed) return { error: rateLimitMessage(permitted.limit) };

  const parsed = z
    .object({
      username,
      password,
      displayName: z.string().trim().max(60).optional(),
      locality: z.string().trim().min(2, "Locality: say where you are").max(80),
      lat: z.coerce.number({ error: "Place your pin on the map" }).min(-90).max(90),
      lng: z.coerce.number({ error: "Place your pin on the map" }).min(-180).max(180),
      covenant: z.literal("on", { error: "You must agree to the ground rules to join." }),
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
  if (!parsed.success) return { error: firstIssue(parsed.error), field: issueField(parsed.error) };

  const d = parsed.data;
  const weakPassword = passwordProblem(d.password, d.username);
  if (weakPassword) return { error: weakPassword, field: "password" };
  if (!isValidLatLng(d)) return { error: "Place your pin on the map." };
  const pin = roundPin(d);
  await recordAttempt("join", [addressKey]);
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
      return { error: "That username is already taken.", field: "username" };
    }
    throw e;
  }

  await createSession(userId, 0);
  redirect("/home");
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({ username, password: z.string().min(1, "Password is required") })
    .safeParse({ username: formData.get("username"), password: formData.get("password") });
  if (!parsed.success) return { error: firstIssue(parsed.error), field: issueField(parsed.error) };

  // Two throttles: the address (someone trying many names) and the username
  // (many addresses trying one name). Only failures are recorded below, so a
  // person who types their password right is never slowed down.
  const addressKey = await clientAddressKey();
  const nameKey = usernameKey(parsed.data.username);
  const permitted = await rateLimitPermits("login", [
    { key: addressKey, limit: addressLimit(addressKey, "loginPerAddress") },
    { key: nameKey, limit: RATE_LIMITS.loginPerUsername },
  ]);
  if (!permitted.allowed) return { error: rateLimitMessage(permitted.limit) };

  const user = await db.user.findUnique({
    where: { username: parsed.data.username },
    select: { id: true, passwordHash: true, sessionVersion: true },
  });
  // Always run the comparison so timing does not reveal whether the name exists.
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    await recordAttempt("login", [addressKey, nameKey]);
    return { error: "Wrong username or password. Passwords cannot be reset, so check it carefully." };
  }

  await createSession(user.id, user.sessionVersion);
  redirect("/home");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
