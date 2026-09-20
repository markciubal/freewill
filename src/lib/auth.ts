import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { SESSION_SECRET_MIN_LENGTH, SESSION_SECRET_RECOMMENDED_LENGTH, sessionIsCurrent } from "./security";

// Sessions are a signed, httpOnly cookie. There is no email, no reset flow, no
// third party. A person is their username, their password, and their vouches.
//
// The cookie carries the account's session version at the time it was issued
// (`sv`). Changing the password or choosing "log out everywhere" bumps the
// version on the account, and every older cookie stops working at once.

const COOKIE = "fw_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

let warnedAboutShortSecret = false;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < SESSION_SECRET_MIN_LENGTH) {
    throw new Error(`SESSION_SECRET must be set to at least ${SESSION_SECRET_MIN_LENGTH} characters (see .env.example)`);
  }
  if (s.length < SESSION_SECRET_RECOMMENDED_LENGTH && !warnedAboutShortSecret) {
    warnedAboutShortSecret = true;
    console.warn(`SESSION_SECRET is ${s.length} characters; ${SESSION_SECRET_RECOMMENDED_LENGTH} or more is recommended for a public deployment.`);
  }
  return new TextEncoder().encode(s);
}

export async function createSession(userId: string, sessionVersion: number) {
  const token = await new SignJWT({ sv: sessionVersion })
    .setSubject(userId)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

// The signed claims in the cookie, or null when there is no valid cookie. This
// does not touch the database; `getSessionUserId` below does, because a token
// is only trusted once its version matches the account.
const readSessionToken = cache(async (): Promise<{ userId: string; sessionVersion: unknown } | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? { userId: payload.sub, sessionVersion: payload.sv } : null;
  } catch {
    return null;
  }
});

export const getSessionUserId = cache(async (): Promise<string | null> => {
  const session = await readSessionToken();
  if (!session) return null;
  const account = await db.user.findUnique({ where: { id: session.userId }, select: { sessionVersion: true } });
  if (!account || !sessionIsCurrent(session.sessionVersion, account.sessionVersion)) return null;
  return session.userId;
});

export const userSelect = {
  id: true,
  username: true,
  displayName: true,
  bio: true,
  locality: true,
  lat: true,
  lng: true,
  skills: true,
  graceBalance: true,
  hoursBalance: true,
  publicKey: true,
  keySetAt: true,
  theme: true,
  createdAt: true,
  covenantAcceptedAt: true,
  humanVerifiedAt: true,
  affiliations: true,
} as const;

// One database read: the account row, including its session version, which
// must match the version the cookie was issued with.
export const getCurrentUser = cache(async () => {
  const session = await readSessionToken();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { ...userSelect, sessionVersion: true } });
  if (!user || !sessionIsCurrent(session.sessionVersion, user.sessionVersion)) return null;
  return user;
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
