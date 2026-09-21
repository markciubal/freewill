// Security rules: password policy, rate limiting, session revocation, and the
// response headers. Pure checks first, then a live check of attempt counting
// against the dev database. Run: npm run smoke:security
import "./not-production";
import { SignJWT, jwtVerify } from "jose";
import { db } from "../src/lib/db";
import {
  RATE_LIMITS,
  buildContentSecurityPolicy,
  originOfUrlTemplate,
  passwordProblem,
  rateLimitAllows,
  sessionIsCurrent,
  staticSecurityHeaders,
} from "../src/lib/security";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

async function main() {
  // Passwords: the account has no reset, so the rule has to carry the weight.
  assert(passwordProblem("short1", "ada") !== null, "a short password is refused");
  assert(passwordProblem("correcthorsebatterystaple", "ada") !== null, "a famous password is refused even though it is long");
  assert(passwordProblem("aaaaaaaaaaaaaaaa", "ada") !== null, "one repeated character is refused");
  assert(passwordProblem("my-ada-password-99", "ada") !== null, "a password containing the username is refused");
  assert(passwordProblem("river stone lantern", "ada") === null, "three unrelated words pass");

  // Rate limiting: the decision is separate from the counting.
  const loginLimit = RATE_LIMITS.loginPerUsername;
  assert(rateLimitAllows(loginLimit.max - 1, loginLimit), "one attempt under the limit is allowed");
  assert(!rateLimitAllows(loginLimit.max, loginLimit), "at the limit, the next attempt is refused");

  // Sessions: a token is only good while its version matches the account.
  const secret = new TextEncoder().encode("smoke-secret-that-is-long-enough-32ch");
  const oldToken = await new SignJWT({ sv: 0 }).setSubject("user-1").setProtectedHeader({ alg: "HS256" }).sign(secret);
  const { payload } = await jwtVerify(oldToken, secret);
  assert(sessionIsCurrent(payload.sv, 0), "a token issued at version 0 is current while the account is at 0");
  assert(!sessionIsCurrent(payload.sv, 1), "the same token is dead once the account moves to version 1 (password change / log out everywhere)");
  assert(!sessionIsCurrent(undefined, 0), "a token with no version (issued before this rule) is not trusted");
  assert(!sessionIsCurrent("0", 0), "a version that is not a number is not trusted");

  // Headers: the policy names the nonce, trusts only what it loads, and lets
  // the map fetch tiles from its configured host and nothing else.
  const tileOrigin = originOfUrlTemplate("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  assert(tileOrigin === "https://tile.openstreetmap.org", "the tile host is read out of the tile URL template");
  assert(originOfUrlTemplate("/map/local.pmtiles") === null, "a same-origin map file needs no extra host");
  assert(originOfUrlTemplate("not a url") === null, "an unparseable template yields no host");
  const productionPolicy = buildContentSecurityPolicy({ nonce: "abc123", isDevelopment: false, tileOrigin, mapDataOrigin: null });
  assert(productionPolicy.includes("'nonce-abc123'") && productionPolicy.includes("'strict-dynamic'"), "scripts run only with the nonce or when loaded by a nonced script");
  assert(!productionPolicy.includes("unsafe-eval") && productionPolicy.includes("upgrade-insecure-requests"), "production forbids eval and upgrades insecure requests");
  assert(productionPolicy.includes(`img-src 'self' blob: data: ${tileOrigin}`), "images may come from this site and the tile host only");
  assert(productionPolicy.includes("frame-ancestors 'none'") && productionPolicy.includes("object-src 'none'"), "the site cannot be framed or embed plugins");
  const developmentPolicy = buildContentSecurityPolicy({ nonce: "abc123", isDevelopment: true, tileOrigin: null, mapDataOrigin: "https://tiles.example.org" });
  assert(developmentPolicy.includes("'unsafe-eval'") && developmentPolicy.includes("connect-src 'self' https://tiles.example.org"), "development allows eval (React debugging) and the remote map file host is fetchable");
  const productionHeaders = staticSecurityHeaders({ isProduction: true });
  assert(productionHeaders.some((h) => h.key === "Strict-Transport-Security"), "production sends HSTS");
  assert(!staticSecurityHeaders({ isProduction: false }).some((h) => h.key === "Strict-Transport-Security"), "development does not send HSTS (it would pin localhost to https)");
  assert(productionHeaders.some((h) => h.key === "Permissions-Policy" && h.value.includes("geolocation=(self)") && h.value.includes("camera=()")), "camera is denied outright; geolocation stays possible for the pin picker's button");

  // Live: attempts are counted in the database so they survive serverless restarts.
  try {
    const key = `user:smoke-${Date.now()}`;
    await db.authAttempt.createMany({ data: Array.from({ length: loginLimit.max }, () => ({ kind: "login", key })) });
    const windowStart = new Date(Date.now() - loginLimit.windowMinutes * 60_000);
    const count = await db.authAttempt.count({ where: { kind: "login", key, createdAt: { gte: windowStart } } });
    assert(count === loginLimit.max && !rateLimitAllows(count, loginLimit), `${count} failed logins on one username inside ${loginLimit.windowMinutes} minutes locks the next attempt`);
    await db.authAttempt.deleteMany({ where: { key } }); // this test's own throttling rows
    await db.$disconnect();
  } catch (error) {
    console.log("(dev DB not reachable; skipped live attempt count)", (error as Error).message.split("\n")[0]);
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
