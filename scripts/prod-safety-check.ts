// Nothing that is not real reaches the live database: no demo neighbours, no
// test records, no Grace scaled twice. Each check guards the same promise:
// every figure a person sees counts something that actually happened.
// Run: npm run smoke:prod   (it never connects to any database)
import "./not-production";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { productionReason, sameDatabase } from "../src/lib/database-target";
import { whyNotScale } from "../src/lib/grace-cents";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else console.log("ok:", message);
}

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const packageScripts = JSON.parse(read("package.json")).scripts as Record<string, string>;

// 1. The rule, against made-up environments. None of these URLs is real.
const PROD = "mongodb+srv://app:secret@Cluster0.example.mongodb.net/freewill?retryWrites=true";
const DEV = "mongodb://127.0.0.1:27018/freewill?replicaSet=rs0";
assert(productionReason({ NODE_ENV: "production", DATABASE_URL_PROD: PROD }) !== null, "a script run with NODE_ENV=production is refused");
assert(productionReason({ NODE_ENV: "production", DATABASE_URL: DEV }) !== null, "NODE_ENV=production is refused even when no production URL is configured");
assert(productionReason({ DATABASE_URL_DEV: DEV, DATABASE_URL_PROD: PROD }) === null, "a separate development database is allowed");
assert(productionReason({ DATABASE_URL_DEV: "mongodb+srv://other:pw@cluster0.example.mongodb.net/freewill", DATABASE_URL_PROD: PROD }) !== null, "a development URL naming the production database under other credentials and options is refused");
assert(productionReason({ DATABASE_URL: PROD.replace("Cluster0", "cluster0"), DATABASE_URL_PROD: PROD }) !== null, "the fallback DATABASE_URL naming production is refused, whatever the case of its host");
assert(productionReason({ DATABASE_URL_DEV: PROD.replace("/freewill?", "/freewill_dev?"), DATABASE_URL_PROD: PROD }) === null, "another database on the same cluster is not production");
assert(sameDatabase("mongodb://a:1,b:2/x", "mongodb://u:p@B:2,a:1/x?ssl=true"), "hosts listed in another order are the same database");

// 2. Every script that makes demo or test data refuses production before
// anything else loads: the guard must be its first import.
const firstImport = (file: string) => read(file).split(/\r?\n/).find((line) => /^import\b/.test(line)) ?? "";
const smokeFiles = Object.entries(packageScripts)
  .filter(([name]) => name.startsWith("smoke"))
  .map(([, command]) => /scripts\/[\w.-]+\.ts/.exec(command)?.[0])
  .filter((file): file is string => !!file);
const mustGuard = ["prisma/seed.ts", ...smokeFiles];
const unguarded = mustGuard.filter((file) => !firstImport(file).includes("not-production"));
assert(unguarded.length === 0, `the seed and all ${smokeFiles.length} smoke scripts refuse production before anything else loads${unguarded.length ? `; not: ${unguarded.join(", ")}` : ""}`);

// Any other script that reaches a database must guard too, unless it is one of
// the few meant for the live server, each for a stated reason.
const MEANT_FOR_PRODUCTION: Record<string, string> = {
  "demurrage.ts": "applies the real monthly demurrage to real balances",
  "backfill-ledgerlog.ts": "adds missing hash-chain entries for records that already exist",
  "migrate-grace-cents.ts": "the one-time move to hundredths; refuses a database already in hundredths",
  "prisma-prod.mjs": "points the Prisma CLI at production and refuses seed and reset",
  "rs-init.mjs": "starts the local replica set, from DATABASE_URL_DEV only",
};
const reachesDatabase = readdirSync(path.join(root, "scripts"))
  .filter((file) => /\.(ts|mjs|cjs)$/.test(file))
  .filter((file) => /src\/lib\/db"|new PrismaClient|@prisma\/client/.test(read(`scripts/${file}`)));
const loose = reachesDatabase.filter((file) => !Object.hasOwn(MEANT_FOR_PRODUCTION, file) && !firstImport(`scripts/${file}`).includes("not-production"));
assert(loose.length === 0, `every other script that reaches a database is guarded or named as meant for production${loose.length ? `; neither: ${loose.join(", ")}` : ` (${reachesDatabase.length} reach one)`}`);
const stale = Object.keys(MEANT_FOR_PRODUCTION).filter((file) => !existsSync(path.join(root, "scripts", file)));
assert(stale.length === 0, `every script named as meant for production exists${stale.length ? `; missing: ${stale.join(", ")}` : ""}`);
assert(read("scripts/prisma-prod.mjs").includes("/reset|seed/"), "the production Prisma helper refuses seed and reset");
assert(read("scripts/rs-init.mjs").includes("DATABASE_URL_DEV") && !read("scripts/rs-init.mjs").includes("DATABASE_URL_PROD"), "the replica-set helper reads only the development URL");

// 3. Nothing runs them on the server: no deploy hook, no release step, no
// install or build step, and no shortcut that points the seed at production.
const DATA_MAKING = /seed|smoke|tsx\s/;
const DEPLOY_HOOKS = ["build", "start", "postinstall", "prebuild", "postbuild", "prestart", "poststart", "heroku-prebuild", "heroku-postbuild", "heroku-cleanup", "release", "postdeploy"];
const hooked = DEPLOY_HOOKS.filter((hook) => DATA_MAKING.test(packageScripts[hook] ?? ""));
assert(hooked.length === 0, `no build, start, install or deploy step runs the seed or a test${hooked.length ? `; found in ${hooked.join(", ")}` : ""}`);
assert(!Object.keys(packageScripts).some((name) => /seed/.test(name) && /prod/.test(name)), "there is no script for seeding production");
const procfile = existsSync(path.join(root, "Procfile")) ? read("Procfile") : "";
assert(!DATA_MAKING.test(procfile), `the Procfile runs no seed or test${procfile ? "" : " (there is none)"}`);
const appJson = existsSync(path.join(root, "app.json")) ? read("app.json") : "";
assert(!DATA_MAKING.test(appJson), `app.json has no seeding deploy step${appJson ? "" : " (there is none)"}`);

// 4. The app cannot show content from the seed: no page or library quotes it,
// and no app code imports the seed or a script.
const seed = read("prisma/seed.ts");
const quoted = (key: string) => [...seed.matchAll(new RegExp(`${key}: "([^"]+)"`, "g"))].map((match) => match[1]);
const seedMarkers = [...new Set([...quoted("displayName"), ...quoted("title"), ...quoted("locality"), "freewill123"])];
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(item.name) ? [full] : [];
  });
}
const appSources = sourceFiles(path.join(root, "src")).map((file) => ({ file: path.relative(root, file), text: readFileSync(file, "utf8") }));
// A placeholder is grey hint text in an empty box that goes away as you type:
// it suggests what to write and does not pose as anything that happened.
const withoutPlaceholders = (text: string) => text.replace(/placeholder=(\{[^}]*\}|"[^"]*")/g, "");
const leaked = appSources.flatMap(({ file, text }) => seedMarkers.filter((marker) => withoutPlaceholders(text).includes(marker)).map((marker) => `${file}: "${marker}"`));
assert(seedMarkers.length >= 10 && leaked.length === 0, `no app code contains the people, places, posts or password from the seed (${seedMarkers.length} markers)${leaked.length ? `; found ${leaked.join(", ")}` : ""}`);
// A made-up example shown as if it were activity, like a preview of how a
// payment looks, names only people who cannot exist: a rendered @name must
// contain a character usernames forbid (a hyphen), so it can never be
// mistaken for a real neighbor who signed up under that name.
const renderedNames = appSources.flatMap(({ file, text }) => [...withoutPlaceholders(text).matchAll(/>[^<{]*@([a-z0-9_]{3,24})\b(?!-)[^<]*</g)].map((match) => `${file}: @${match[1]}`));
assert(renderedNames.length === 0, `no page shows a made-up @name that someone could really hold${renderedNames.length ? `; found ${renderedNames.join(", ")}` : ""}`);
const importsData = appSources.filter(({ text }) => /from ["\x27][./@]*\/?(prisma\/seed|scripts\/)/.test(text)).map(({ file }) => file);
assert(importsData.length === 0, `no app code imports the seed or a script${importsData.length ? `; found ${importsData.join(", ")}` : ""}`);

// 5. The move to hundredths cannot be applied twice.
const none = { transfers: 0, adjustments: 0, vouchers: 0, cashNotes: 0, listingsWithGraceAsk: 0, demurrageRunsThatMelted: 0 };
assert(whyNotScale(none) === null, "a database with nothing written in hundredths may be scaled");
const prodShape = whyNotScale({ ...none, transfers: 1, cashNotes: 1 });
assert(prodShape !== null && prodShape.includes("1 Grace transfers") && prodShape.includes("by 100"), `a database that recorded Grace since the change is refused, saying why: "${prodShape}"`);
const migration = read("scripts/migrate-grace-cents.ts");
assert(migration.indexOf("whyNotScale(") > 0 && migration.indexOf("whyNotScale(") < migration.indexOf("updateMany("), "the migration decides whether it may scale before it changes any amount");

// 6. The guard stops a real run. The seed and a smoke test are started with a
// made-up production URL that nothing listens on; each must refuse at once,
// before it tries to connect. The child gets only these variables, so no real
// connection string from this machine can reach it.
const tsx = path.join(root, "node_modules/tsx/dist/cli.mjs");
const base = Object.fromEntries(["PATH", "Path", "SystemRoot", "TEMP", "TMP", "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA"].filter((key) => process.env[key]).map((key) => [key, process.env[key]!]));
const NOWHERE = "mongodb://127.0.0.1:9/never-used";
function run(file: string, env: Record<string, string>) {
  const result = spawnSync(process.execPath, [tsx, file], { cwd: root, env: { ...base, ...env } as NodeJS.ProcessEnv, encoding: "utf8", timeout: 60_000 });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}
const attempts: [string, Record<string, string>, string][] = [
  ["prisma/seed.ts", { NODE_ENV: "production", DATABASE_URL_PROD: NOWHERE }, "on a production server"],
  ["scripts/ledger-smoke.ts", { NODE_ENV: "production", DATABASE_URL_PROD: NOWHERE }, "on a production server"],
  ["prisma/seed.ts", { DATABASE_URL_DEV: NOWHERE, DATABASE_URL_PROD: NOWHERE }, "with its development URL pointed at production"],
];
for (const [file, env, how] of attempts) {
  const { status, output } = run(file, env);
  assert(status === 1 && output.includes("Refusing to run") && !/Seeded|ok:/.test(output), `${file} refuses ${how}, before connecting (exit ${status})`);
}
const allowed = run("scripts/not-production.ts", { DATABASE_URL_DEV: "mongodb://127.0.0.1:9/dev", DATABASE_URL_PROD: NOWHERE });
assert(allowed.status === 0 && !allowed.output.includes("Refusing"), "the guard lets a separate development database through");
