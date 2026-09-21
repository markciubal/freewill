// Which database a process is about to use, and whether it is production.
// Pure: it reads only the environment it is handed, so the rule can be checked
// against made-up environments without touching any database.
//
// Why this exists: demo data or test records on the live server would show
// people activity that never happened (neighbours who do not exist, trades
// nobody made), a false sense of use in a place where people decide whom to
// trust by what they see. So anything that makes such data asks this first,
// and refuses production. There is deliberately no override.

export type Env = Record<string, string | undefined>;

// The same choice src/lib/db.ts makes: production uses DATABASE_URL_PROD,
// everything else DATABASE_URL_DEV, and plain DATABASE_URL is the fallback.
export function chooseDatabaseUrl(env: Env): string | undefined {
  const production = env.NODE_ENV === "production";
  return (production ? env.DATABASE_URL_PROD : env.DATABASE_URL_DEV) || env.DATABASE_URL || undefined;
}

// Two connection strings name the same database when their hosts and database
// name match, whatever the credentials, options or letter case of the host.
// "mongodb+srv://u:p@Cluster0.x.net/freewill?retryWrites=true" and
// "mongodb+srv://other@cluster0.x.net/freewill" are the same database.
export function databaseIdentity(url: string): string {
  const withoutScheme = url.replace(/^[a-z+]+:\/\//i, "");
  const withoutCredentials = withoutScheme.replace(/^[^@/]*@/, "");
  const [hostPart, ...rest] = withoutCredentials.split("/");
  const databaseName = (rest.join("/").split("?")[0] || "").trim();
  const hosts = hostPart.toLowerCase().split(",").map((host) => host.trim()).sort().join(",");
  return `${hosts}/${databaseName}`;
}

export function sameDatabase(a: string, b: string): boolean {
  return databaseIdentity(a) === databaseIdentity(b);
}

// Null when the process is not pointed at production; otherwise the reason,
// in words, for the refusal message.
export function productionReason(env: Env): string | null {
  if (env.NODE_ENV === "production") return "NODE_ENV is production, so it would use the production database";
  const chosen = chooseDatabaseUrl(env);
  const production = env.DATABASE_URL_PROD;
  if (chosen && production && sameDatabase(chosen, production)) return "the database it would use is the same one DATABASE_URL_PROD names";
  return null;
}
