// Pure security rules: no database, no request context, so every one of them
// can be tested directly and read by anyone. The pieces that need a database
// or a request (counting attempts, reading the client address) live in
// ratelimit.ts and call into here.

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

// There is no reset flow, so the password is the whole account. Twelve
// characters is the floor; a few unrelated words is the easiest way to get
// there and remember it.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

// Passwords long enough to pass the length rule but still guessed first by
// anyone trying. Lowercased before comparison.
const WELL_KNOWN_PASSWORDS = new Set([
  "passwordpassword", "password1234", "password12345", "123456789012", "1234567890123", "qwertyuiopas",
  "qwertyuiopasdf", "abcdefghijkl", "iloveyouiloveyou", "letmeinletmein", "adminadminadmin", "welcome12345",
  "changemechangeme", "trustno1trustno1", "freewillfreewill", "correcthorsebatterystaple",
]);

// Returns a plain-language problem with the password, or null when it is fine.
// `username` is rejected inside the password because it is the one public
// string an attacker is certain to try.
export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password needs at least ${PASSWORD_MIN_LENGTH} characters. A few unrelated words is easiest to remember.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) return `Password can be at most ${PASSWORD_MAX_LENGTH} characters.`;
  const lowered = password.toLowerCase();
  if (WELL_KNOWN_PASSWORDS.has(lowered)) return "That password is on every guess list. Choose something only you would think of.";
  if (/^(.)\1+$/.test(password)) return "A password made of one repeated character is too easy to guess.";
  if (username && username.length >= 3 && lowered.includes(username.toLowerCase())) {
    return "Your password must not contain your username.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

// How many attempts a single key (an address, or a username) may make inside
// the window before it is told to wait. Failed logins count; successful ones
// do not. Joins count whether or not they succeed, since each one creates an
// account.
export const RATE_LIMITS = {
  loginPerAddress: { max: 20, windowMinutes: 15 },
  loginPerUsername: { max: 8, windowMinutes: 15 },
  joinPerAddress: { max: 5, windowMinutes: 60 },
} as const;

export type RateLimit = { max: number; windowMinutes: number };

// Visitors through the onion service all reach the app from Tor on the same
// machine, with no address of their own (hiding it is the point). Counted per
// address, one person's allowance would be shared by everyone on Tor and a
// few failed logins would lock them all out. So onion visits share one bucket
// with wider limits instead. The per-username login limit still applies in
// full, so no single account can be guessed at any faster. Tor's own
// proof-of-work defence (docs/onion.md) is what makes flooding it costly.
export const ONION_ADDRESS_KEY = "onion";
export const ONION_RATE_LIMITS: Partial<Record<keyof typeof RATE_LIMITS, RateLimit>> = {
  loginPerAddress: { max: 200, windowMinutes: 15 },
  joinPerAddress: { max: 30, windowMinutes: 60 },
};

// The per-address limit for this address key: the onion bucket's own where it
// has one, the ordinary limit otherwise.
export function addressLimit(addressKey: string, which: Exclude<keyof typeof RATE_LIMITS, "loginPerUsername">): RateLimit {
  return (addressKey === ONION_ADDRESS_KEY ? ONION_RATE_LIMITS[which] : undefined) ?? RATE_LIMITS[which];
}

// The decision, separated from the counting so it can be tested: given how
// many attempts happened inside the window, may one more proceed?
export function rateLimitAllows(attemptsInWindow: number, limit: RateLimit): boolean {
  return attemptsInWindow < limit.max;
}

// The message a person sees when told to wait. Deliberately does not say
// which key tripped, so it reveals nothing about whether a username exists.
export function rateLimitMessage(limit: RateLimit): string {
  return `Too many attempts. Wait about ${limit.windowMinutes} minutes and try again.`;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

// A session token is only valid while the version it carries matches the
// version on the account. Bumping the account's version (password change,
// "log out everywhere") kills every token issued before it.
export function sessionIsCurrent(tokenVersion: unknown, accountVersion: number): boolean {
  return typeof tokenVersion === "number" && Number.isInteger(tokenVersion) && tokenVersion === accountVersion;
}

// SESSION_SECRET signs every cookie. Sixteen characters is the hard floor
// (below that the server refuses to start); thirty-two is what the example
// env file ships with and what a production deployment should have.
export const SESSION_SECRET_MIN_LENGTH = 16;
export const SESSION_SECRET_RECOMMENDED_LENGTH = 32;

// ---------------------------------------------------------------------------
// Response headers
// ---------------------------------------------------------------------------

// The Content-Security-Policy for one response. The nonce marks the scripts
// Next.js itself emits; with 'strict-dynamic', scripts those load are trusted
// too and nothing else can run. That is the guard that matters most here,
// because a member's identity key lives in the browser: a script an attacker
// managed to inject is a stolen key. Inline styles stay allowed; they cannot
// read storage and the per-person theme is an inline <style>.
//
// `tileOrigin` and `mapDataOrigin` are the hosts the map may load from, taken
// from NEXT_PUBLIC_TILE_URL / NEXT_PUBLIC_PMTILES_URL when those are remote.
//
// `plainHttp` is set for visits through the onion service, which run over
// http:// because Tor already encrypts end to end. There, telling the browser
// to upgrade insecure requests would send every script to https://...onion,
// where nothing answers, so that one directive is left out.
export function buildContentSecurityPolicy(opts: { nonce: string; isDevelopment: boolean; tileOrigin: string | null; mapDataOrigin: string | null; plainHttp?: boolean }): string {
  const imageSources = ["'self'", "blob:", "data:", opts.tileOrigin].filter(Boolean).join(" ");
  const connectSources = ["'self'", opts.mapDataOrigin].filter(Boolean).join(" ");
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${opts.nonce}' 'strict-dynamic'${opts.isDevelopment ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${imageSources}`,
    `connect-src ${connectSources}`,
    `font-src 'self' data:`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ];
  if (!opts.isDevelopment && !opts.plainHttp) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

// The origin ("https://host") of a URL template such as a tile URL with
// {z}/{x}/{y} placeholders, or null when the URL is relative (same origin) or
// unparseable.
export function originOfUrlTemplate(urlTemplate: string | undefined | null): string | null {
  if (!urlTemplate || urlTemplate.startsWith("/")) return null;
  try {
    return new URL(urlTemplate.replace(/\{[a-z]\}/gi, "0")).origin;
  } catch {
    return null;
  }
}

// Headers that apply to every response and need no per-request value.
export function staticSecurityHeaders(opts: { isProduction: boolean }): { key: string; value: string }[] {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Geolocation stays available to this origin because the pin picker has a
    // button a person may press; nothing asks for it automatically.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
  ];
  if (opts.isProduction) headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  return headers;
}
